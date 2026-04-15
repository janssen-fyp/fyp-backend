// const express = require("express");
// const cors = require("cors");

// const app = express();
// const PORT = 5001;

// app.use(cors());
// app.use(express.json());

// app.get("/", (req, res) => {
//   res.json({ message: "Backend is running" });
// });

// app.get("/api/predict", async (req, res) => {
//   try {
//     const site = req.query.site || "6041";
//     const hours = req.query.hours || "6";

//     const response = await fetch(
//       `http://127.0.0.1:8002/predict?site=${site}&hours=${hours}`
//     );

//     if (!response.ok) {
//       return res.status(response.status).json({
//         error: "Failed to fetch prediction from Prophet API",
//       });
//     }

//     const data = await response.json();

//     return res.json({
//       source: "prophet",
//       ...data,
//     });
//   } catch (error) {
//     console.error("Backend /api/predict error:", error.message);
//     return res.status(500).json({
//       error: "Backend failed to fetch prediction",
//       details: error.message,
//     });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Backend running on http://127.0.0.1:${PORT}`);
// });

const express = require("express");
const cors = require("cors");

const { graph, nodeCoords } = require("./services/route-graph");
const { astar } = require("./services/astar");

const app = express();
const PORT = 5001;

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

function buildWeightedGraph(baseGraph, congestionMap = {}) {
  const weightedGraph = {};

  for (const fromNode of Object.keys(baseGraph)) {
    weightedGraph[fromNode] = baseGraph[fromNode].map((edge) => {
      const edgeKey = `${fromNode}-${edge.to}`;
      const congestionFactor = congestionMap[edgeKey] || 1;

      return {
        to: edge.to,
        weight: edge.baseWeight * congestionFactor,
      };
    });
  }

  return weightedGraph;
}

app.post("/api/route", async (req, res) => {
  try {
    let { start, destination, congestionMode } = req.body;

    if (!start || !destination) {
      return res.status(400).json({
        error: "start and destination are required",
      });
    }

    start = String(start).trim().toLowerCase();
    destination = String(destination).trim().toLowerCase();
    congestionMode = String(congestionMode || "normal").trim().toLowerCase();

    if (!graph[start]) {
      return res.status(400).json({
        error: `Unknown start node "${start}". Use one of: ${Object.keys(graph).join(", ")}`,
      });
    }

    if (!graph[destination]) {
      return res.status(400).json({
        error: `Unknown destination node "${destination}". Use one of: ${Object.keys(graph).join(", ")}`,
      });
    }

    let congestionMap = {};

    if (congestionMode === "upper") {
      congestionMap = {
        "a-b": 3.0,
        "b-c": 3.0,
        "c-f": 3.0,
      };
    }

    if (congestionMode === "lower") {
      congestionMap = {
        "a-d": 3.0,
        "d-e": 3.0,
        "e-f": 3.0,
      };
    }

    const weightedGraph = buildWeightedGraph(graph, congestionMap);
    const nodePath = astar(weightedGraph, nodeCoords, start, destination);

    if (!nodePath || nodePath.length === 0) {
      return res.status(404).json({
        error: "No route found between the selected nodes.",
      });
    }

    const coordinatePath = nodePath.map((node) => nodeCoords[node]);

    return res.json({
      source: "node-backend-astar",
      start,
      destination,
      congestionMode,
      congestionMap,
      nodePath,
      path: coordinatePath,
    });
  } catch (error) {
    console.error("Backend /api/route error:", error.message);
    return res.status(500).json({
      error: "Backend failed to generate route",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://127.0.0.1:${PORT}`);
});