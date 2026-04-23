const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5001;

const db = require("./db");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running" });
});

app.get("/api/predict", async (req, res) => {
  try {
    const site = req.query.site || "6041";
    const hours = req.query.hours || "6";

    const response = await fetch(
      `http://127.0.0.1:8002/predict?site=${site}&hours=${hours}`
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to fetch prediction from Prophet API",
      });
    }

    const data = await response.json();

    return res.json({
      source: "prophet",
      ...data,
    });
  } catch (error) {
    console.error("Backend /api/predict error:", error.message);
    return res.status(500).json({
      error: "Backend failed to fetch prediction",
      details: error.message,
    });
  }
});

async function geocodePlace(query) {
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "ie",
      bounded: "1",
      viewbox: "-6.30,53.37,-6.20,53.33", // Dublin city centre-ish
    }).toString();

  const response = await fetch(url, {
    headers: {
      "User-Agent": "FYP-Traffic-Project/1.0",
      "Accept-Language": "en",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`);
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Could not geocode: ${query}`);
  }

  const best = results[0];

  return {
    lat: Number(best.lat),
    lon: Number(best.lon),
    displayName: best.display_name,
  };
}

async function getOsrmRoutes(startCoord, endCoord) {
  const coordinates = `${startCoord.lon},${startCoord.lat};${endCoord.lon},${endCoord.lat}`;

  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?` +
    new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: "false",
      alternatives: "true",
    }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OSRM route failed with status ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error("OSRM returned no routes");
  }

  return data.routes.map((route, index) => {
    const latLngPath = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

    return {
      id: index,
      distance: route.distance,
      duration: route.duration,
      path: latLngPath,
      rawGeometry: route.geometry.coordinates, // [lon, lat]
    };
  });
}

async function getPredictionSummary(site = "6041", hours = "6") {
  const response = await fetch(
    `http://127.0.0.1:8002/predict?site=${site}&hours=${hours}`
  );

  if (!response.ok) {
    throw new Error(`Prediction API failed with status ${response.status}`);
  }

  const data = await response.json();

  const predictionArray = Array.isArray(data.prediction)
    ? data.prediction
    : Array.isArray(data.predictions)
    ? data.predictions
    : [];

  if (predictionArray.length === 0) {
    throw new Error("Prediction array is empty.");
  }

  const yhatValues = predictionArray
    .map((item) => Number(item.yhat))
    .filter((value) => Number.isFinite(value));

  if (yhatValues.length === 0) {
    throw new Error("No valid yhat values found.");
  }

  const averageYhat =
    yhatValues.reduce((sum, value) => sum + value, 0) / yhatValues.length;

  const maxYhat = Math.max(...yhatValues);
  const minYhat = Math.min(...yhatValues);

  return {
    site,
    hours: Number(hours),
    averageYhat,
    maxYhat,
    minYhat,
    predictionCount: yhatValues.length,
  };
}

function inferCongestionScenario(predictionSummary) {
  const threshold = 700;
  const severeThreshold = 900;

  const avg = predictionSummary.averageYhat;

  if (avg >= severeThreshold) {
    return {
      scenario: "high",
      mode: "upper",
      threshold,
      severeThreshold,
      reason: "Predicted traffic is significantly above the severe threshold.",
    };
  }

  if (avg >= threshold) {
    return {
      scenario: "moderate",
      mode: "upper",
      threshold,
      severeThreshold,
      reason: "Predicted traffic is above the congestion threshold.",
    };
  }

  return {
    scenario: "low",
    mode: "lower",
    threshold,
    severeThreshold,
    reason: "Predicted traffic is below the congestion threshold.",
  };
}

async function resolvePredictionInference(site = "6041", hours = "6") {
  try {
    const predictionSummary = await getPredictionSummary(site, hours);
    const inference = inferCongestionScenario(predictionSummary);

    return {
      ok: true,
      predictionSummary,
      inference,
    };
  } catch (error) {
    console.error("Prediction inference error:", error.message);

    return {
      ok: false,
      predictionSummary: null,
      inference: {
        scenario: "unknown",
        mode: "normal",
        threshold: 700,
        severeThreshold: 900,
        reason: "Prediction inference failed. Falling back to normal mode.",
      },
      error: error.message,
    };
  }
}

function getAverageLatitude(path) {
  if (!Array.isArray(path) || path.length === 0) return 0;
  const total = path.reduce((sum, [lat]) => sum + lat, 0);
  return total / path.length;
}

function normalize(value, min, max) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function scoreRoutes(routes, effectiveCongestionMode, averageYhat) {
  const durations = routes.map((r) => r.duration);
  const distances = routes.map((r) => r.distance);
  const avgLats = routes.map((r) => getAverageLatitude(r.path));

  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  const minLat = Math.min(...avgLats);
  const maxLat = Math.max(...avgLats);

  return routes.map((route) => {
    const avgLat = getAverageLatitude(route.path);

    const durationNorm = normalize(route.duration, minDuration, maxDuration);
    const distanceNorm = normalize(route.distance, minDistance, maxDistance);
    const latNorm = normalize(avgLat, minLat, maxLat); // 1 = 更北，0 = 更南

    let scenarioPenalty = 0;

    if (effectiveCongestionMode === "upper") {
      // 上路拥堵：越北惩罚越高
      scenarioPenalty = latNorm * 10;
    } else if (effectiveCongestionMode === "lower") {
      // 下路拥堵：越南惩罚越高
      scenarioPenalty = (1 - latNorm) * 10;
    } else {
      scenarioPenalty = 0;
    }

    let predictionPenalty = 0;
    if (Number.isFinite(averageYhat)) {
      if (averageYhat >= 900) {
        predictionPenalty = 0.3;
      } else if (averageYhat >= 700) {
        predictionPenalty = 0.15;
      } else {
        predictionPenalty = 0.05;
      }
    }

    // 让 congestion scenario 成为主导因素
    const score =
      durationNorm * 0.15 +
      distanceNorm * 0.05 +
      scenarioPenalty * 0.75 +
      predictionPenalty * 0.05;

    return {
      ...route,
      metrics: {
        avgLat,
        durationNorm,
        distanceNorm,
        latNorm,
        scenarioPenalty,
        predictionPenalty,
      },
      score,
    };
  });
}
function pickBestRoute(scoredRoutes) {
  const sorted = [...scoredRoutes].sort((a, b) => a.score - b.score);
  return {
    best: sorted[0],
    ranked: sorted,
  };
}

app.post("/api/route", async (req, res) => {
  try {
    let { start, destination, congestionMode, startCoords } = req.body;

    if (!start || !destination) {
      return res.status(400).json({
        error: "start and destination are required",
      });
    }

    start = String(start).trim();
    destination = String(destination).trim();
    congestionMode = String(congestionMode || "normal").trim().toLowerCase();

    let effectiveCongestionMode = congestionMode;

    const predictionInference = await resolvePredictionInference("6041", "6");

    if (congestionMode === "auto") {
      effectiveCongestionMode = predictionInference.inference.mode;
    }

    const startCoord =
        startCoords &&
        Number.isFinite(Number(startCoords.lat)) &&
        Number.isFinite(Number(startCoords.lon))
            ? {
                lat: Number(startCoords.lat),
                lon: Number(startCoords.lon),
                displayName: "Current Location",
            }
            : await geocodePlace(start);

    const endCoord = await geocodePlace(destination);

    // 🔥 必须有这句
    const routes = await getOsrmRoutes(startCoord, endCoord);

    const averageYhat = Number.isFinite(
      predictionInference?.predictionSummary?.averageYhat
    )
      ? predictionInference.predictionSummary.averageYhat
      : null;

    const scoredRoutes = scoreRoutes(
      routes,
      effectiveCongestionMode,
      averageYhat
    );

    const { best, ranked } = pickBestRoute(scoredRoutes);

    const predictedTraffic = predictionInference?.predictionSummary?.averageYhat ?? null;
    const thresholdValue = predictionInference?.inference?.threshold ?? null;
    const congestionScenario = predictionInference?.inference?.scenario ?? null;

    const insertDecision = db.prepare(`
    INSERT INTO route_decisions (
        start_location,
        destination,
        requested_mode,
        effective_mode,
        predicted_traffic,
        threshold_value,
        congestion_scenario,
        alternatives_count,
        selected_route_id,
        distance,
        duration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDecision.run(
    start,
    destination,
    congestionMode,
    effectiveCongestionMode,
    predictedTraffic,
    thresholdValue,
    congestionScenario,
    routes.length,
    best.id,
    best.distance,
    best.duration
    );

    return res.json({
      source: "nominatim-osrm-ai-selection",
      start,
      destination,
      requestedCongestionMode: congestionMode,
      effectiveCongestionMode,
      predictionInference,
      startCoord,
      endCoord,
      selectedRouteId: best.id,
      distance: best.distance,
      duration: best.duration,
      score: best.score,
      path: best.path,
      alternativesCount: routes.length,
      alternatives: ranked.map((route) => ({
        id: route.id,
        distance: route.distance,
        duration: route.duration,
        score: route.score,
        metrics: route.metrics,
        path: route.path,
      })),
    });
  } catch (error) {
    console.error("Backend /api/route error:", error.message);
    return res.status(500).json({
      error: "Backend failed to generate route",
      details: error.message,
    });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT *
        FROM route_decisions
        ORDER BY datetime(created_at) DESC
        LIMIT 10
      `)
      .all();

    return res.json({
      items: rows,
    });
  } catch (error) {
    console.error("Backend /api/history error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch route history",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://127.0.0.1:${PORT}`);
});