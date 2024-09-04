import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client
} from "@aws-sdk/client-s3"

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import express from "express"
import expressWs from "express-ws"
import path from "path"
import url from "url"

import pubsub from "./pubsub.js"
import * as db from "./db.js"

const { app, getWss } = expressWs(express())
const port = 3000

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

app.use(express.json())
app.use(express.raw({ type: 'audio/*', limit: '10mb' }))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.use(function (error, req, res, next) {
  console.error(error)
  res.status(500)
  res.json({ error: error.message, stack: error.stack })
})

const S3 = new S3Client()

app.get('/', async (req, res) => {
  let list = await db.query('SELECT name, text FROM clips ORDER BY id')

  res.locals.clips = list.rows
  res.locals.timestamp = pubsub.timestamp
  res.render('index')

  // wake up whisper machine
  if (process.env.WHISPER_URL) {
    fetch(process.env.WHISPER_URL)
  }
})

app.use('/', express.static(path.join(__dirname, 'public')))

app.get("/audio/:name", async (req, res, next) => {
  try {
    const data = await S3.send(new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: req.params.name
    }))

    res.setHeader("Content-Type", data.ContentType)

    let { start, end } = req.range()[0] || {}
    if (end) {
      end = Math.min(end, data.ContentLength - 1)
      if (end < start) {
        res.status(416)
        res.end()
        return
      }

      res.setHeader("Content-Range", `bytes ${start}-${end}/${data.ContentLength}`)
      res.setHeader("Accept-Ranges", "bytes")
      res.setHeader("Content-Length", end - start + 1)
      res.status(206)
      res.end((await data.Body.transformToByteArray()).slice(start, end + 1))
    } else {
      data.Body.pipe(res)
    }
  } catch (err) {
    if (err.name === "NoSuchKey") return next()
    console.error(err)
    console.error(err.stack)
    res.status(500)
    res.setHeader("Content-Type", "application/json")
    res.json(err)
  }

})

app.put("/audio/:name", async (req, res) => {
  try {
    const data = await S3.send(new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: req.params.name,
      Body: req.body,
      ContentType: req.headers["content-type"]
    }))

    await db.query("INSERT INTO clips (name) VALUES ($1)", [req.params.name])

    res.json(data)

    if (process.env.WHISPER_URL) {
      // Fetch the presigned URL to download this clip
      let clip_url = await getSignedUrl(
        S3,
        new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: req.params.name
        }),
        { expiresIn: 3600 }
      )

      let input = { audio: clip_url }

      let response = await fetch(process.env.WHISPER_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input })
      })

      let results = await response.json()

      await db.query(
        "UPDATE clips SET text = $1 WHERE name = $2",
        [results.output.transcription, req.params.name]
      )

      await pubsub.publish(new Date().toISOString())
    }
  } catch (err) {
    console.error(err)
    console.error(err.stack)
    res.status(500)
    res.json(err)
  }
})

app.delete("/audio/:name", async (req, res) => {
  try {
    const data = await S3.send(new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: req.params.name
    }))

    await db.query("DELETE FROM clips WHERE name = $1", [req.params.name])

    res.json(data)
  } catch (err) {
    console.error(err)
    console.error(err.stack)
    res.status(500)
    res.json(err)
  }
})

// Define web socket route
app.ws('/websocket', ws => {
  // update client on a best effort basis
  try {
    ws.send(pubsub.timestamp.toString());
  } catch (error) {
    console.error(error)
  }

  // We don’t expect any messages on websocket, but log any ones we do get.
  ws.on('message', console.log)
})

// Publish count updates to all web socket clients
pubsub.connect(getWss())

app.post("/publish", async (req, res) => {
  let timestamp = pubsub.timestamp
  await pubsub.publish(req.body.timestamp)
  res.json({ timestamp })
})

// Start the server
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
