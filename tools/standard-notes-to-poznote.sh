#!/bin/bash

# Usage: ./convert_sn_to_poznote.sh standard_notes_export.zip
SN_ZIP="$1"
TMP_DIR="tmp_sn_export"
OUTPUT_DIR="poznote_export"

# --- Check prerequisites ---
required_tools=(jq unzip zip find)
for tool in "${required_tools[@]}"; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: $tool is not installed. Please install it and try again."
    exit 1
  fi
done

# --- Check input file ---
if [ -z "$SN_ZIP" ]; then
  echo "Usage: $0 <standard_notes_export.zip>"
  exit 1
fi

# --- Clean temporary directories ---
rm -rf "$TMP_DIR" "$OUTPUT_DIR"
mkdir -p "$TMP_DIR" "$OUTPUT_DIR"

# --- Unzip Standard Notes export ---
unzip -q "$SN_ZIP" -d "$TMP_DIR"
SN_JSON="$TMP_DIR/Standard Notes Backup and Import File.txt"
if [ ! -f "$SN_JSON" ]; then
  echo "Main JSON file not found"
  exit 1
fi

# --- Process each note ---
jq -c '.items[] | select(.content_type=="Note")' "$SN_JSON" | while read -r note; do
  note_created=$(echo "$note" | jq -r '.created_at')
  note_uuid=$(echo "$note" | jq -r '.uuid')
  note_title=$(echo "$note" | jq -r '.content.title')

  # Note content: prioritize file in Items/Note
  note_file=$(find "$TMP_DIR/Items/Note" -type f -name "*$note_uuid.txt" | head -n 1)
  if [ -f "$note_file" ]; then
    note_content=$(cat "$note_file")
  else
    note_content=$(echo "$note" | jq -r '.content.text // ""')
  fi

  # Get tags for the note
  mapfile -t tags_array < <(jq -r --arg uuid "$note_uuid" '.items[] | select(.content_type=="Tag") | select(.content.references[]?.uuid == $uuid) | .content.title' "$SN_JSON")

  # Clean the note title for use as filename
  # If title is empty or contains only whitespace, use UUID
  if [ -z "$note_title" ] || [ -z "$(echo "$note_title" | tr -d '[:space:]')" ]; then
    note_title="note_$note_uuid"
  fi
  
  # Replace problematic characters in filename
  # Replace / with - and remove other problematic characters
  safe_filename=$(echo "$note_title" | sed 's/\//-/g' | sed 's/[<>:"|?*]/-/g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  
  # Ensure filename is not empty after cleaning
  if [ -z "$safe_filename" ]; then
    safe_filename="note_$note_uuid"
  fi

  # Create Markdown file with front matter
  {
    echo "---"
    echo "created: \"$note_created\""
    echo "tags:"
    for t in "${tags_array[@]}"; do
      echo "  - \"$t\""
    done
    echo "---"
    echo ""
    echo "$note_content"
  } > "$OUTPUT_DIR/$safe_filename.md"
done

# --- Create the final zip compatible with Poznote ---
ZIP_NAME="poznote_export.zip"
rm -f "$ZIP_NAME"
cd "$OUTPUT_DIR"
zip -r "../$ZIP_NAME" . > /dev/null
cd ..

# --- Clean temporary directories ---
rm -rf "$TMP_DIR" "$OUTPUT_DIR"

echo "Conversion completed! Generated file: $ZIP_NAME"
