#!/bin/bash
export REQUEST_METHOD="POST"
export CONTENT_TYPE="application/x-www-form-urlencoded"
echo "source_folder=Test&target_folder=Default&workspace=Poznote" | php api_move_folder_files.php
