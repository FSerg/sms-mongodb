# This image will be based on the oficial nodejs docker image
FROM node:latest

RUN apt-get update && apt-get install -y

# Commands will run in this directory
WORKDIR /home/app

# Add all our code inside that directory that lives in the container
ADD . /home/app
RUN openssl req -nodes -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -subj "/C=RU/CN=localhost"

# Install dependencies and generate production files *
RUN npm install

# The command to run our app when the container is run
CMD ["npm", "run", "start"]
