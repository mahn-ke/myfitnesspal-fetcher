FROM node:24-alpine

WORKDIR /app
COPY ./ /app

RUN npm ci

CMD ["npm", "run", "start"]