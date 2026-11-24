FROM python:3.13-slim

LABEL org.opencontainers.image.source="https://github.com/itfetter/itfetter-blog"
WORKDIR /app
COPY server.py content_store.py content.js index.html styles.css markdown.js studio.html admin.js ./
COPY assets/ ./assets/
RUN mkdir /data && chown 10001:10001 /data
ENV BLOG_DATA_DIR=/data BLOG_PORT=8081
USER 10001:10001
ENTRYPOINT ["python", "-B", "-u", "server.py"]
CMD ["--production"]
