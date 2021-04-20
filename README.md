# Video-Classroom
Video conferencing app using SFU

## Steps to run
* Clone the repository using ```git clone https://github.com/mdazharuddin1011999/Video-Classroom.git```
* Change the directory using ```cd Video-Conference```
* **For Linux users only ([Click here for details](https://mediasoup.org/documentation/v3/mediasoup/installation/#linux-osx-and-any-nix-system)):**
  - Install node version >= v10.0.0
  - Install python version 2 or 3
  - Install make
  - Install gcc and g++ >= 4.9 or clang (with C++11 support)
  - Install cc and c++ commands (symlinks) pointing to the corresponding gcc/g++ or clang/clang++ executables.
  - run ```npm install```
  - [Replace announcedIp with your IP in mediasoup-config.js](https://github.com/mdazharuddin1011999/Video-Classroom/blob/f232952d37887d5b30b69b7d13749485c2f76845/mediasoup-config.js#L105)
  - run ```npm start```
* **For Windows 10 users only:**
  - Install wsl2 ([Click here for steps](https://docs.microsoft.com/en-us/windows/wsl/install-win10))
  - Install [Docker Desktop for Windows](https://hub.docker.com/editions/community/docker-ce-desktop-windows)
  - run ```docker build -t igit/video_conference:latest .```
  - [Replace announcedIp with your IP in mediasoup-config.js](https://github.com/mdazharuddin1011999/Video-Classroom/blob/f232952d37887d5b30b69b7d13749485c2f76845/mediasoup-config.js#L105)
  - run ```docker run -p 3000:3000/tcp -p 2000-2020:2000-2020/udp -p 2000-2020:2000-2020/tcp igit/video_conference```
* Open https://localhost:3000 or ```https://<your-ip-address>:3000```
  
## Technologies Used:
* [Node.js](https://nodejs.org/en/) for backend
* [Mediasoup](https://mediasoup.org/) for creating SFU
* [Socket.io](https://socket.io/) for signalling
* [Express](https://expressjs.com/) for server creation
* [Docker](https://www.docker.com/) for containerization of app
  
