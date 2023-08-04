FROM golang:1.20-bookworm as build

RUN apt-get update && \
  apt-get upgrade -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /opt/code



FROM build AS app-build

COPY go.mod go.sum .
RUN go mod download

COPY . .

RUN go build -a -o ./out/server ./server.go



FROM build AS app

RUN apt-get update && \
  apt-get upgrade -y && \
  apt-get install -y dumb-init && \
  # debugging utils
  apt-get install -y dnsutils ncat tcpdump iproute2 procps && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

COPY --from=app-build /opt/code/out/server .

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/opt/code/server"]
