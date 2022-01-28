FROM node:12-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm i --only=production

COPY edge.js .

EXPOSE 8080
CMD [ "npm", "start" ]