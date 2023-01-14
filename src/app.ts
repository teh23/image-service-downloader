import express from "express";
import validate from "./helpers/validate.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import EventEmitter from "events";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
fs.mkdirSync("./temp", { recursive: true });
const ee = new EventEmitter();
// https://randomwordgenerator.com/img/picture-generator/natural-4946737_640.jpg
// https://via.placeholder.com/150

const app = express();
app.use(express.static("temp"));
app.use(express.json());

const queue = [];
const db = new Map();

app.post(
  "/",
  validate(
    z.object({
      body: z.object({
        url: z.string().url("Invalid url"),
      }),
    })
  ),
  async (req, res) => {
    const { url } = req.body;

    const entity = {
      id: uuidv4(),
      status: "queued",
      created_at: new Date().toISOString(),
      src: url,
      downloaded_at: null,
      url: null,
    };
    db.set(entity.id, entity);
    queue.push(entity);
    ee.emit("download");
    res.send(`http://localhost:3000/${entity.id}`).status(200);
  }
);

app.get(
  "/:id",
  validate(
    z.object({
      params: z.object({
        id: z.string().uuid("Invalid parameter"),
      }),
    })
  ),
  async (req, res) => {
    const { id } = req.params;
    console.log(db.get(id));
    res.sendStatus(200);
  }
);

ee.on("download", async () => {
  console.log("start download");
  if (queue.length === 0) {
    return;
  }
  const entity = queue.shift();
  db.set(entity.id, {
    ...entity,
    status: "pending",
  });
  const response = await fetch(entity.src);
  const contentTypeOfUrl = response.headers.get("content-type");
  const isImage = contentTypeOfUrl.split("/")[0] === "image";
  if (!isImage) {
    db.set(entity.id, {
      ...entity,
      status: "failed",
    });
    return;
  }
  db.set(entity.id, {
    ...entity,
    status: "downloading",
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  // save file using blog and fs
  fs.writeFile(`./temp/${entity.id}.png`, buffer, (err) => {
    if (err) {
      console.log(err);
    }
    db.set(entity.id, {
      ...entity,
      status: "completed",
      downloaded_at: new Date().toISOString(),
      url: `http://localhost:3000/images/${entity.id}`,
    });
  });
});

app.get("/", (req, res) => {
  // get all values from db
  res.send([...db.values()]);
});

app.get("/images/:id", (req, res) => {
  const { id } = req.params;
  const entity = db.get(id);
  if (!entity) {
    res.sendStatus(404);
    return;
  }

  res.sendFile(path.join(__dirname, "../temp", `${id}.jpg`));
});

export default app;
