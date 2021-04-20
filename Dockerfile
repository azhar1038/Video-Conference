FROM node:10 AS stage-one
WORKDIR /service
COPY package*.json .
RUN npm install
COPY . .
CMD ["npm", "start"]