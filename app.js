import {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client
} from "@aws-sdk/client-s3"

import express from "express"
import expressWs from "express-ws"
import path from "path"
import url from "url"

import pubsub from "./pubsub.js"

const { app, getWss } = expressWs(express())
const port = 3000

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

app.use(express.json())
app.use(express.raw({ type: 'audio/*', limit: '10mb' }))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

const S3 = new S3Client()

app.get('/', async (req, res) => {
  const objects = await S3.send(new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME
  }));

  res.locals.clips = objects.Contents?.map(obj => obj.Key) || []
  res.locals.timestamp = pubsub.timestamp
  res.render('index')
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

    res.json(data)
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
  console.log(req.body)
  await pubsub.publish(req.body.timestamp)
  res.status(200)
  res.send('OK')
})

// Start the server
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
