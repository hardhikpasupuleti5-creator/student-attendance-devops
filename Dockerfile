FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY . .

VOLUME ["/usr/src/app/data"]
ENV PORT=3000
ENV DB_PATH=/usr/src/app/data/attendance.db

EXPOSE 3000

CMD ["npm", "start"]