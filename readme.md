# [Web Dictaphone](http://todomvc.com), adapted for [fly.io](https://fly.io/)

This is a fork of [mdn/dom-examples/media/web-dictaphone](https://github.com/mdn/dom-examples/tree/main/media/web-dictaphone#readme), with the following modifications:

* adds Express server, with support for GET, POST, DELETE; including ranges
* adds Tigris support for storing audio files.
* adds Redis and websockets for broadcasting updates

With these changes multiple replicas of this application can be deployed, even in multiple regions.


# Deployment

In an empty directory, run:

```
fly launch --from https://github.com/fly-apps/node-dictaphone.git
```

If you visit this application, you will see a standard web dictaphone example.

To create additional machines in other regions, run:

```
fly scale count 3 --region dfw,waw,syd
```

Note: By default, all machines will be configured to [automatically stop and start](https://fly.io/docs/apps/autostart-stop/).

