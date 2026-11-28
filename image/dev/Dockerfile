# runnerbox-base plus the tools most projects' jobs reach for, so one image serves every repo a
# machine runs CI for: Node with pnpm, bun and EAS, Python with uv, Rust, Playwright's system
# libraries, gh and the AWS CLI. Projects with heavier needs start FROM this or the base instead.
# Browsers aren't included, since each project pins its own Playwright. Build it after the base:
#   docker build -t runnerbox-dev image/dev
# Update versions and checksums by hand; each checksum is the one its project publishes.
ARG BASE=runnerbox-base
FROM ${BASE}
ARG PNPM_VERSION=12.23.0
ARG EAS_VERSION=27.11.0
ARG PLAYWRIGHT_VERSION=1.65.1
ARG BUN_VERSION=1.4.5
ARG BUN_SHA256=94559b3b528995a49452f9f2404cec74f2efd7d06e0a000a8cd214b02c3666eb
ARG UV_VERSION=0.13.10
ARG UV_SHA256=bf65ac1a0af10f92c522d91ac096c7c0a39657647b155577e7836c2cbbb4526c
ARG GH_VERSION=2.106.0
ARG GH_SHA256=a476449fa9625413c54a3734eded62e9e480e49f421ff08e7f3b3879c059a033
ARG RUSTUP_VERSION=1.29.3
ARG RUSTUP_SHA256=b1c8cb14e30889e7e2999e6b69e62d9e9b9ffc0f4df8180564d306d9680e6c55
ARG RUST_VERSION=1.100.1
# AWS publishes a GPG signature, not a checksum; this is the sha256 of the zip that signature verifies.
ARG AWS_CLI_VERSION=2.42.5
ARG AWS_CLI_SHA256=7694a5b0bdd31ddccdbe9c103849cfe1a2aa4b4768e803a50ae94610aa970800
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git-lfs python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*
# The base keeps Node in the tool cache for setup-node; this puts it on PATH and global npm
# packages in /usr/local, so jobs that don't run setup-node still have it.
RUN node_bin="$(echo /opt/hostedtoolcache/node/*/x64/bin)" \
  && ln -s "$node_bin/node" "$node_bin/npm" "$node_bin/npx" /usr/local/bin/ \
  && npm config set --location=global prefix /usr/local \
  && npm install -g "pnpm@${PNPM_VERSION}" "eas-cli@${EAS_VERSION}" \
  && npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps \
  && npm cache clean --force && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 5 --retry-all-errors "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" -o bun.zip \
  && echo "${BUN_SHA256}  bun.zip" | sha256sum -c - && unzip -q bun.zip && install -m 755 bun-linux-x64/bun /usr/local/bin/bun \
  && ln -s bun /usr/local/bin/bunx && rm -r bun.zip bun-linux-x64
RUN curl -fsSL --retry 5 --retry-all-errors "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz" -o uv.tgz \
  && echo "${UV_SHA256}  uv.tgz" | sha256sum -c - && tar -xzf uv.tgz --strip-components=1 -C /usr/local/bin && rm uv.tgz
RUN curl -fsSL --retry 5 --retry-all-errors "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" -o gh.tgz \
  && echo "${GH_SHA256}  gh.tgz" | sha256sum -c - && tar -xzf gh.tgz --strip-components=2 -C /usr/local/bin "gh_${GH_VERSION}_linux_amd64/bin/gh" && rm gh.tgz
RUN curl -fsSL --retry 5 --retry-all-errors "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${AWS_CLI_VERSION}.zip" -o aws.zip \
  && echo "${AWS_CLI_SHA256}  aws.zip" | sha256sum -c - && unzip -q aws.zip && ./aws/install && rm -r aws.zip aws
USER runner
# Rust lives in the runner's home, so cargo can write its registry and builds without root.
ENV CARGO_HOME=/home/runner/.cargo RUSTUP_HOME=/home/runner/.rustup PATH=/home/runner/.cargo/bin:$PATH
RUN curl -fsSL --retry 5 --retry-all-errors "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init" -o rustup-init \
  && echo "${RUSTUP_SHA256}  rustup-init" | sha256sum -c - && chmod +x rustup-init \
  && ./rustup-init -y --no-modify-path --profile minimal --default-toolchain "${RUST_VERSION}" -c clippy -c rustfmt && rm rustup-init
