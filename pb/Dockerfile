# syntax=docker/dockerfile:1

FROM alpine:3.20

ARG PB_VERSION=0.36.2
ARG TARGETARCH

RUN apk add --no-cache ca-certificates curl unzip \
  && mkdir -p /pb

WORKDIR /pb

# Map docker TARGETARCH to PocketBase arch naming
RUN case "$TARGETARCH" in \
      amd64) PB_ARCH=amd64 ;; \
      arm64) PB_ARCH=arm64 ;; \
      *) echo "Unsupported arch: $TARGETARCH"; exit 1 ;; \
    esac \
  && curl -L -o pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
  && unzip -o pocketbase.zip \
  && rm -f pocketbase.zip \
  && chmod +x pocketbase

EXPOSE 8090
