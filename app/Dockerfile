FROM node:25-alpine

WORKDIR /app
COPY ./ /app

RUN npm ci

CMD ["npm", "run", "start"]