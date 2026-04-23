# FROM mcr.microsoft.com/devcontainers/rust:latest
FROM mcr.microsoft.com/devcontainers/rust:2-bookworm
# FROM rust:1-bullseye

ARG DEBIAN_FRONTEND=noninteractive
# Unfuck the keyring
# RUN apt-get update --allow-unauthenticated && apt-get install --reinstall debian-archive-keyring
# Install LLD for wasm-ld
RUN apt update && apt install -y lld
# Switch to nightly
RUN rustup toolchain install nightly && rustup default nightly && rustup component add rustfmt 
RUN	rustup component add clippy
# Install wasm tools
RUN cargo install wasm-pack wasm-opt wasm-tools
RUN rustup target add wasm32-unknown-unknown

RUN apt-get update && apt-get install -y coreutils binaryen

# SHELL ["/bin/bash", "--login", "-c"]
# install nvm
ENV NVM_DIR=/usr/local/nvm
RUN mkdir -p $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Install Node.js version
ENV NODE_VERSION=24.14.1
RUN . $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm alias default $NODE_VERSION && nvm use default

# Add Node.js and npm to PATH
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

