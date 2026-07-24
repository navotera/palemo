FROM node:20-alpine AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM composer:2 AS php-deps
WORKDIR /app/backend
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --optimize-autoloader

FROM php:8.1-cli-alpine
RUN apk add --no-cache postgresql-dev && docker-php-ext-install pdo_pgsql
WORKDIR /app
COPY backend ./backend
COPY db ./db
COPY internal/openapi/openapi.yaml ./internal/openapi/openapi.yaml
COPY --from=php-deps /app/backend/vendor ./backend/vendor
COPY --from=web-build /src/web/dist/index.html ./backend/public/spa/index.html
COPY --from=web-build /src/web/dist/assets ./backend/public/assets
RUN rm -f backend/bootstrap/cache/*.php && chown -R www-data:www-data backend/storage backend/bootstrap/cache
USER www-data
EXPOSE 8080
ENTRYPOINT ["php","backend/artisan","serve","--host=0.0.0.0","--port=8080"]
