# Taskio MVP

This is the repository for the Taskio MVP, a platform to connect homeowners with trusted, verified tradies through a secure escrow payment system. This project contains both the frontend React application and the backend Node.js server.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You will need to have Node.js installed on your machine. You can download it from [nodejs.org](https://nodejs.org/).

### Installation

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/YourUsername/Taskio-MVP.git](https://github.com/YourUsername/Taskio-MVP.git)
    cd Taskio-MVP
    ```

2.  **Set up the Backend:**
    Navigate to the backend directory and install the NPM packages.
    ```sh
    cd backend
    npm install
    ```

3.  **Set up the Frontend:**
    Navigate to the frontend directory and install the NPM packages.
    ```sh
    cd ../frontend
    npm install
    ```

### Running the Application

You will need two separate terminals to run both the backend and frontend servers simultaneously.

1.  **Run the Backend Server:**
    In your first terminal, navigate to the `backend` directory and run:
    ```sh
    node index.js
    ```
    The server should now be running on http://localhost:8000.

2.  **Run the Frontend Application:**
    In your second terminal, navigate to the `frontend` directory and run:
    ```sh
    npm start
    ```
    This will open the React application in your browser, usually at http://localhost:3000.