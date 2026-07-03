ARG RUN

FROM node:24-alpine as builderenv

WORKDIR /app

# build the app
COPY . /app
RUN yarn install --frozen-lockfile
RUN yarn build

# remove devDependencies, keep only used dependencies
RUN yarn install --prod --frozen-lockfile

########################## END OF BUILD STAGE ##########################

FROM node:24-alpine

RUN apk update && apk add --no-cache tini

# NODE_ENV configures runtime options (JSON logger, etc.)
ENV NODE_ENV production

ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

ARG CURRENT_VERSION=Unknown
ENV CURRENT_VERSION=${CURRENT_VERSION:-Unknown}

WORKDIR /app
COPY --from=builderenv /app /app

RUN echo "" > /app/.env

# Do NOT use a custom ENTRYPOINT so signals (SIGTERM) reach the service for graceful shutdown.
ENTRYPOINT ["tini", "--"]
CMD [ "/usr/local/bin/node", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]
