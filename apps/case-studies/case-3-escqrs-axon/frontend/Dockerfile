# Kubernetes 向けフロントエンドイメージ（SPA を nginx で配信し /api を gateway へプロキシ）
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.k8s.conf /etc/nginx/templates/default.conf.template
ENV PORT=8080
EXPOSE 8080
# nginx:alpine の entrypoint が /etc/nginx/templates/*.template を envsubst して展開する
