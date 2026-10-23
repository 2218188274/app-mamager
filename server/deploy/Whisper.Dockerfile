FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY server/deploy/whisper-v1.9.5.tar.gz source.tar.gz
RUN printf 'ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720  source.tar.gz\n' | sha256sum -c - && tar -xzf source.tar.gz --strip-components=1 && rm source.tar.gz
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_CURL=OFF -DBUILD_SHARED_LIBS=OFF && cmake --build build --target whisper-server whisper-cli -j2

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
COPY --from=build /src/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=build /src/LICENSE /licenses/whisper-MIT.txt
COPY server/deploy/WHISPER-MODEL-LICENSE.txt /licenses/whisper-model-MIT.txt
USER 65532:65532
WORKDIR /tmp
EXPOSE 8080
ENTRYPOINT ["whisper-server"]
CMD ["--host", "0.0.0.0", "--port", "8080", "-m", "/models/ggml-base-q5_1.bin", "-t", "3", "-bs", "1", "-bo", "1", "-l", "auto", "-nt", "-nf"]
