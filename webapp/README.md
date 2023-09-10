# Resume Matcher - A Full Stack Web Application

The Resume Matcher takes your resume and job descriptions as input, parses them using Python, and mimics the functionalities of an ATS, providing you with insights and suggestions to make your resume ATS-friendly.

## Demo

View a brief GIF demo of the web apps' design functionality below:

![Resume-Matcher-Web-App-UI-Quick-Demo-2](https://github.com/Sayvai/react-project-dashboard-mvp-match/assets/7581546/5bf9c4c8-a5d1-47ee-8e27-eacda0dbcac9)

## Getting Started

### Prerequisites

- install [Node.js](https://nodejs.org/en/download/). The version used for this project is v18.17.0

- install [Python](https://www.python.org/downloads/). The version used for this project is v3.11.5

### Setup

- clone the repository
- navigate to the project directory (e.g. `cd Resume-Matcher`)
- Follow the [README](../README.md) instructions set out in the root of the repository to setup the Python environment and run the Python scripts.
- navigate to the `webapp` directory (e.g. `cd webapp`)
- run `npm install` to install the frontend client app dependencies
- run `npm run dev` to start the web app (i.e. this script will start the frontend client and backend FastAPI servers concurrently within one terminal process inside `webapp` directory`)
- once both servers are ready, open [http://localhost:3000](http://localhost:3000) on your browser to view and interact with the app.

### Extra Setup Hints

- 💡 You may also decide to run the frontend and backend servers in separate terminal processes independently of one another. To run the frontend server in isolation, run `npm run next-dev`. To run the backend FastAPI server in isolation, run `npm run fastapi-dev`.

## Future Improvements

Below are some of the improvements that can be made to the web app for future consideration:

- 👉 Replace mock response data with real data from the backend. View file; [scripts/resume_processor.py](/webapp/api/scripts/resume_processor.py), where the `build_response()` function can be modified to hook up to other python scripts to process and return the real data from the backend. The initial python response model classes are defined in the [schemas/resume_processor.py](/webapp/api/schemas/resume_processor.py) file, and so that should help to get started with thinking about how to structure the data to be returned from the backend.
- Add unit tests (frontend and backend)
- Add end-to-end functional tests (frontend)
- Improve the UI/UX of loading and error states as requests are made to the backend

## Technologies Used

This is a full stack web application, hosting the frontend UI interactive web client interface, and the backend server API.

The application is built using the following main technologies:

- [Next.js](https://nextjs.org/) - a React.js meta-framework for building client and server-side rendered React applications

- [FastAPI](https://fastapi.tiangolo.com/) - a Python framework for building web APIs

- [TailwindCSS](https://tailwindcss.com/) - a CSS framework for building responsive web applications

- [Zustand](https://github.com/pmndrs/zustand) - a frontend client state management library

- [react-pdf](https://projects.wojtekmaj.pl/react-pdf/) - a React component library for rendering PDF documents on the frontend ui
