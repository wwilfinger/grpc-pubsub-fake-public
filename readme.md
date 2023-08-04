A not-very-minimal reproduction for https://github.com/grpc/grpc-node/issues/2502.

# Background

In the wild we've seen NodeJS PubSub publishers get "stuck" and continually report DEADLINE_EXCEEDED errors until the process is restarted. Much investigation later, this appears to be related to a sequence of:

* NodeJS client begins to create a TLS session. The handshake gets to the client receiving `ServerHello`.
* Something (other event loop work, starved cpu) prevents NodeJS from completing the TLS handshake
* Server-side times out the TLS connection after 10s sends `FIN,ACK`
* NodeJS frees up, continues TLS handshake by sending `ChangeCipherSpec,Finished`
* Server-side sends `RST`
* NodeJS somehow thinks the TLS session is valid (??)

This code reproduces by...

Server-side: A partially implemented PubSub gRPC server with an outrageously short connection timeout of 1 millisecond.

Client-side: Try publishing a message every 500ms. Every 1ms, add some numbers together to simulate other processing.

# Running

We're using self-signed certificates. Run `./cert/generate.sh` which generates certs with the openssl cli. Hopefully that leaves the certificates in `./cert/`. The `compose.yml` is configured to read these certificates. I'm running on Linux (Fedora 38) fwiw.

`docker compose up --build` should build the container images and start them up. Most of the console output will be from the `client` container. The client has grpc-js tracing turned on for `transport,transport_flowctrl`.

The server is implemented in Golang to avoid using NodeJS on both ends. The compose file is set up to run three replicas of the server. I've seen this reproduce with one server container but running replicas makes it happen more quickly.

# Reproduction

On the server-side, we're logging every call to Publish. If there are no server logs then the server isn't getting any RPCs.

On the client-side, `transport_flowctrl` will log the remote (server) window size. Once you see `transport_flowctrl` logging window sizes, you've reproduced. This sometimes takes a few seconds for me, but never more than a minute.

One way to tell things are broken, on the server we've set the initial window size to 1 MiB with `grpc.InitialConnWindowSize`.

```
grpcServer := grpc.NewServer(
  grpc.Creds(creds),
  grpc.ConnectionTimeout(config.ConnectionTimeout),
  grpc.InitialConnWindowSize(1024*1024),
  grpc.KeepaliveParams(
    keepalive.ServerParameters{
      MaxConnectionAge:      10 * time.Second,
      MaxConnectionAgeGrace: 5 * time.Second,
    },
  ),
)
```

If this reproduces, the client will not be reporting the correct remote window size.

```
transport_flowctrl | (7) 172.24.0.3:50051 local window size: 65535 remote window size: 65472
```

http/2 SETTINGS frames are always sent by both endpoints at the start of a connection [according to the RFC](https://httpwg.org/specs/rfc7540.html#SETTINGS). The remote window size being wrong from the start means something's fundamentally broken.

Other evidence on the client container (`docker compose exec client bash`, a few network utilities are installed):

`ss -tap` won't show any TCP connections to any "sever" container ips.

`tcpdump -i eth0` won't show any packets hitting the network interface

`ps aux` the node process memory will slowly grow over time.

# Anti-reproduction

Stop the docker compose. Edit `compose.yml` and in the `server` service update `APP_CONNECTION_TIMEOUT: "1000ms"`. Restart with `docker compose up --build`

On the client, `transport_flowcontrol` trace logs will show "remote window size" counting down from something-near 1 MiB. "local window size" will count down from something-near 64 KiB. One of the server containers will be logging `recv Publish` after every client-side `transport_flowctrl` logs.

In the client container, recheck `ss -tap`, `tcpdump -i eth0` etc and things will appear healthy.

Note: if you make any server or client code changes, make sure to pass `--build` in `docker compose up --build` to pull those changes into the containers.
