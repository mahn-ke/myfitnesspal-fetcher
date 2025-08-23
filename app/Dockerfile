FROM node:22-alpine

WORKDIR /app
COPY ./ /app

RUN npm ci

CMD ["npm", "run", "start"]