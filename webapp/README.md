# Resume Matcher - A Full Stack Web Application

The Resume Matcher takes your resume and job descriptions as input, parses them using Python, and mimics the functionalities of an ATS, providing you with insights and suggestions to make your resume ATS-friendly.

> [!WARNING]
> The results returned from through the web app are currently entirely mocked / faked. This means that the results returned are not real and are just for demonstration purposes. This will be implemented with real data results in a future release.

## Demo

View a brief GIF demo of the web apps' design functionality below:

![Resume-Matcher-Web-App-UI-Quick-Demo-2](https://github.com/Sayvai/react-project-dashboard-mvp-match/assets/7581546/5bf9c4c8-a5d1-47ee-8e27-eacda0dbcac9)

## Getting Started

### Prerequisites

- install [Node.js](https://nodejs.org/en/download/). The version used for this project is v18.17.0

- install [Python](https://www.python.org/downloads/). The version used for this project is v3.11.5

### Setup

1. clone the repository
2. navigate to the project directory (e.g. `cd Resume-Matcher`)
3. Follow the [README](../README.md) instructions set out in the root of the repository to setup the Python environment and run the Python scripts.
4. navigate to the `webapp` directory (e.g. `cd webapp`)
5. run `npm install` to install the frontend client app dependencies
6. For Mac OS / Linux / WSL users: run `npm run dev` to start the web app (i.e. this script will start the frontend client and backend FastAPI servers concurrently within one terminal process inside `webapp` directory`)
7. For Windows (non-WSL) users: run `npm run dev-win` to start the web app (i.e. this script will start the frontend client and backend FastAPI servers concurrently within one terminal process inside `webapp` directory`)
8. once both servers are ready, open [http://localhost:3000](http://localhost:3000) on your browser to view and interact with the app.

### Extra Setup Hints

- 💡 You may also decide to run the frontend and backend servers in separate terminal processes independently of one another. To run the frontend server in isolation, run `npm run next-dev`. To run the backend FastAPI server in isolation, run `npm run fastapi-dev` (For Mac OS / Linux / WSL) or `npm run fastapi-dev-win` (For Windows non-WSL).

## Debugging

### VS Code Debugger - FastAPI Backend

When working with the backend web application files, you may like to debug the backend server during runtime and have the ability to set breakpoints to pause execution on certain line(s), inspect variable values, and other runtime data using the VS Code debugger. To do so, follow the steps below:

#### Setup VS Code Launch Configuration

- Open the VS Code debugger tab (i.e. the bug icon on the left sidebar)

- Click on the gear icon to open the launch.json file

- Add the following configuration to the launch.json file, and save:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug FastAPI Backend",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["webapp.backend.api.index:app", "--reload"],
      "jinja": true,
      "justMyCode": true
    }
  ]
}
```

#### Start the Backend Server in Debug Mode

1. ⚠️ IMPORTANT: Before proceeding along this set of steps, ensure the frontend server is NOT running. It will need to be running in isolation of the backend server, after the backend server has successfully completed its startup process.

2. Open the VS Code debugger tab (i.e. the bug icon on the left sidebar)

3. Select the "Debug FastAPI Backend" configuration from the dropdown

4. Click on the play button to start the backend server in debug mode

5. A new terminal window will open and the backend server will start running in debug mode

6. You may optionally set breakpoints in the backend python files to pause execution on certain line(s), inspect variable values, and other runtime data, as you interact with the app or make requests to the backend server.

7. Ensure the frontend server is running in isolation of the backend server, after the backend server has successfully completed its starup process. By running the following command in a separate terminal window:

```bash
npm run next-dev
```

8. Once the backend server (and frontend server) is ready, open [http://localhost:3000](http://localhost:3000) on your browser to view and interact with the app.

### Visual demonstration of running the FastAPI backend server in VS Code Debugger

![Resume-Matcher-vs-code-debug-backend-fastapi-demo](https://github.com/srbhr/Resume-Matcher/assets/7581546/04b3b8e2-98c4-40ff-964f-8075c55091c9)

## Troubleshooting Common Issues

### Error: connect ECONNREFUSED 127.0.0.1:8000

<details>
<summary>You may encounter the following <code>Error: connect ECONNREFUSED 127.0.0.1:8000</code> error in the terminal (and browser ui throws an exception) when running the frontend server in isolation of the backend server via npm run next-dev (👉 👀 click to reveal error snippet):</summary>

```bash
[0] Failed to proxy http://127.0.0.1:8000/api/service-keys Error: connect ECONNREFUSED 127.0.0.1:8000
[0]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1495:16) {
[0]   errno: -61,
[0]   code: 'ECONNREFUSED',
[0]   syscall: 'connect',
[0]   address: '127.0.0.1',
[0]   port: 8000
[0] }
[0] Error: connect ECONNREFUSED 127.0.0.1:8000
[0]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1495:16) {
[0]   errno: -61,
[0]   code: 'ECONNREFUSED',
[0]   syscall: 'connect',
[0]   address: '127.0.0.1',
[0]   port: 8000
[0] }
[0] SyntaxError: Unexpected token I in JSON at position 0
[0]     at JSON.parse (<anonymous>)
[0]     at parseJSONFromBytes (node:internal/deps/undici/undici:6662:19)
[0]     at successSteps (node:internal/deps/undici/undici:6636:27)
[0]     at node:internal/deps/undici/undici:1236:60
[0]     at node:internal/process/task_queues:140:7
[0]     at AsyncResource.runInAsyncScope (node:async_hooks:203:9)
[0]     at AsyncResource.runMicrotask (node:internal/process/task_queues:137:8)
[0]     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
[0] - error node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.edge.development.js (340:14) @ getErrorMessage
```

</details>
<br/>

💡 This is most likely because the backend server has not yet started in isolation. To resolve this, ensure the backend server is running in isolation of the frontend server, by running the following command in a separate terminal window, and wait for the backend server to complete its startup process, then refresh the browser window to view the app:

```bash
npm run fastapi-dev
```

💡 Or, you may alternatively run the backend server using the VS Code debugger, as described in the [VS Code Debugger - FastAPI Backend](#vs-code-debugger---fastapi-backend) section above.

## Future Improvements

Below are some of the improvements that can be made to the web app for future consideration:

- 👉 Replace mock response data with real data from the backend. View file; [scripts/resume_processor.py](/webapp/backend/scripts/resume_processor.py), where the `build_response()` function can be modified to hook up to other python scripts to process and return the real data from the backend. The initial python response model classes are defined in the [schemas/resume_processor.py](/webapp/backend/schemas/resume_processor.py) file, and so that should help to get started with thinking about how to structure the data to be returned from the backend.
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
