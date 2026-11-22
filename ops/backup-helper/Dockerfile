FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS node_runtime

FROM postgres:17.12-bookworm@sha256:837bed18782820fe967067cb5328b02b0d9992c1be9a37ee0c9c492cfc03af3b

COPY --from=node_runtime /usr/local/ /usr/local/
COPY --from=node_runtime /lib/x86_64-linux-gnu/libatomic.so.1.2.0 /lib/x86_64-linux-gnu/libatomic.so.1.2.0
RUN ln -s libatomic.so.1.2.0 /lib/x86_64-linux-gnu/libatomic.so.1

WORKDIR /app
COPY package.json ./
COPY src/config.mjs src/encrypt.mjs src/server.mjs src/start.mjs ./src/

ENV NODE_ENV=production \
    PG_DUMP_PATH=/usr/lib/postgresql/17/bin/pg_dump

USER postgres
EXPOSE 10000
CMD ["node", "src/start.mjs"]
