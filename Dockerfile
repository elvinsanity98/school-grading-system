# Single-image deployment: API + built web app on one port.
# NOTE: written for a VPS / cloud host; not run on the machine this project was developed on.
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci && npm run build
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 3000
# Applies database migrations, then starts the server.
CMD ["npm", "start"]
