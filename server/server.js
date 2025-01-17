const auth = require("json-server-auth");
const jsonServer = require("json-server");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins (modify as needed for security)
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

global.io = io;

// Track connected clients
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const router = jsonServer.router("db.json");

// Middleware to emit events
router.render = (req, res) => {
  const path = req.path;
  const method = req.method;

  if (
    path.includes("/conversations") &&
    (method === "POST" || method === "PATCH")
  ) {
    io.emit("conversation", { data: res.locals.data });
  }

  if (path.includes("/messages") && method === "POST") {
    io.emit("message", { data: res.locals.data });
  }

  res.json(res.locals.data);
};

const middlewares = jsonServer.defaults();
const port = process.env.PORT || 9000;

app.db = router.db;
app.use(middlewares);

// Authentication and authorization
const rules = auth.rewriter({
  users: 640,
  conversations: 660,
  messages: 660,
});

app.use(rules);
app.use(auth);
app.use(router);

server.listen(port, () => console.log(`Server is running on port ${port}`));
