FROM ${CI_REGISTRY_IMAGE}/image:node

WORKDIR /usr/src/app

COPY ["./dist", "./"]

ENV NODE_PATH /usr/src/app
ENTRYPOINT ["node","--enable-source-maps", "/usr/src/app/${OPS_APPLICATION_NAME}/start.js"]
