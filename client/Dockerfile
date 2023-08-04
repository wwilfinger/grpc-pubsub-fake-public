FROM node:18.16.1-bookworm-slim as build

RUN apt-get update && \
  apt-get upgrade -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /opt/code



FROM build AS app-build

COPY . .

RUN npm clean-install && \
  npm run build && \
  npm clean-install --omit=dev



FROM build AS app

RUN apt-get update && \
  apt-get upgrade -y && \
  apt-get install -y dumb-init && \
  # debugging utils
  apt-get install -y dnsutils ncat tcpdump iproute2 procps && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

COPY --from=app-build /opt/code/node_modules ./node_modules/
COPY --from=app-build /opt/code/dist ./dist/

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "--heapsnapshot-signal=SIGUSR2", "./dist/index.js"]
