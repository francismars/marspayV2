#!/bin/bash

# Find the process ID of the Node.js app running from ./src
grepped=$(pgrep -a node | grep ./src)

# Check if the process was found
if [ -n "$grepped" ]; then
    read -a pidMarsPay <<< "$grepped"
    pidFinal=${pidMarsPay[0]}

    # Kill the process if a valid PID is found
    if [[ $pidFinal =~ ^[0-9]+$ ]]; then
        sudo kill "$pidFinal"
        echo "Process $pidFinal terminated."
    else
        echo "Error: Invalid PID extracted."
    fi
else
    echo "No matching process found."
fi