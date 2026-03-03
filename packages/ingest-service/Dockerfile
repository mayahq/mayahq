# Start with an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the requirements file into the container
COPY requirements.txt ./

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Make port 80 available to the world outside this container
EXPOSE 80

# Define environment variable (can be overridden by Railway)
ENV MODULE_NAME="app.main"
ENV VARIABLE_NAME="app"
# Railway will set this, but good default
ENV PORT="80"

# Run app.main:app when the container launches
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT 