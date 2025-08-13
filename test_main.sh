#!/bin/bash

# Test script to debug main function

main() {
    echo "Main function works!"
    echo "Arguments: $@"
}

echo "Calling main function..."
main "$@"
echo "Main function call completed."
