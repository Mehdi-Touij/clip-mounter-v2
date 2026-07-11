FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

RUN chmod +x start.sh
RUN mkdir -p db videos outputs

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["./start.sh"]