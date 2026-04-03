#!/usr/bin/env python3
"""
Annotate MEI Notes with Timing Information

Script to read a .mei file, locate a note by its xml:id, and add a when="HH:MM:SS.ms" 
attribute to it.

Usage:
    python annotate_mei_note.py input.mei note_id "HH:MM:SS.ms"
    python annotate_mei_note.py clair-de-lune.mei f1u1s1b6 "00:01:30.500"
"""

import argparse
import os
import sys
from pathlib import Path
from xml.etree import ElementTree as ET


# MEI namespace declaration
MEI_NAMESPACE = "http://www.music-encoding.org/ns/mei"
namespaces = {"mei": MEI_NAMESPACE, "xml": "http://www.w3.org/XML/1998/namespace"}


def load_mei_file(mei_file_path):
    """
    Load and parse a MEI file with proper namespace handling.
    
    Args:
        mei_file_path (str): Path to the .mei file
        
    Returns:
        ElementTree: The parsed XML tree
        
    Raises:
        FileNotFoundError: If the file does not exist
        ET.ParseError: If the XML is malformed
    """
    if not os.path.exists(mei_file_path):
        raise FileNotFoundError(f"MEI file not found: {mei_file_path}")
    
    try:
        tree = ET.parse(mei_file_path)
        print(f"✓ Loaded MEI file: {mei_file_path}")
        return tree
    except ET.ParseError as e:
        raise ET.ParseError(f"Failed to parse MEI file: {e}")


def find_note_by_id(tree, mei_id):
    """
    Find a <note> element by its xml:id attribute.
    
    Searches recursively through the entire document tree.
    
    Args:
        tree (ElementTree): The parsed XML tree
        mei_id (str): The xml:id value to search for
        
    Returns:
        Element: The note element if found
        
    Raises:
        ValueError: If the note with the given xml:id is not found
    """
    root = tree.getroot()
    
    # Register namespace to handle the MEI namespace prefix
    ET.register_namespace("mei", MEI_NAMESPACE)
    
    # Search for note elements in the MEI namespace
    for note in root.findall(f".//mei:note", namespaces):
        # Check the xml:id attribute (in the XML namespace)
        note_id = note.get("{http://www.w3.org/XML/1998/namespace}id")
        if note_id == mei_id:
            print(f"✓ Found note with xml:id='{mei_id}'")
            return note
    
    # If not found, raise an error with helpful message
    raise ValueError(f"Note with xml:id='{mei_id}' not found in the MEI file")


def add_when_attribute(note_element, onset_time):
    """
    Add the 'when' attribute to a note element.
    
    Args:
        note_element (Element): The <note> element
        onset_time (str): The timing value in HH:MM:SS.ms format
    """
    note_element.set("when", onset_time)
    print(f"✓ Added when='{onset_time}' attribute to note")


def write_annotated_mei(tree, original_file_path):
    """
    Write the modified MEI tree to a new file.
    
    The output file is named {original_filename}_annotated.mei
    
    Args:
        tree (ElementTree): The modified XML tree
        original_file_path (str): Path to the original .mei file
        
    Returns:
        str: Path to the output file
    """
    # Generate output filename
    original_path = Path(original_file_path)
    output_filename = f"{original_path.stem}_annotated.mei"
    output_path = original_path.parent / output_filename
    
    # Write the modified tree to file
    # Preserve XML declaration by using the default encoding
    tree.write(
        str(output_path),
        encoding="UTF-8",
        xml_declaration=True,
        default_namespace=MEI_NAMESPACE
    )
    
    print(f"✓ Created annotated MEI file: {output_path}")
    return str(output_path)


def annotate_mei_note(mei_file_path, mei_id, onset_time):
    """
    Main function to annotate a MEI note with timing information.
    
    Args:
        mei_file_path (str): Path to the input .mei file
        mei_id (str): The xml:id of the note to annotate
        onset_time (str): The timing value in HH:MM:SS.ms format
        
    Returns:
        str: Path to the output annotated .mei file
    """
    try:
        # Step 1: Load the MEI file
        tree = load_mei_file(mei_file_path)
        
        # Step 2: Find the target note element
        note_element = find_note_by_id(tree, mei_id)
        
        # Step 3: Add the when attribute
        add_when_attribute(note_element, onset_time)
        
        # Step 4: Write the modified MEI to output file
        output_path = write_annotated_mei(tree, mei_file_path)
        
        print("\n✓ Annotation complete!")
        return output_path
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    """Parse command-line arguments and run the annotation script."""
    parser = argparse.ArgumentParser(
        description="Annotate MEI notes with timing information",
        epilog="Example: python annotate_mei_note.py input.mei note_id \"00:01:30.500\""
    )
    
    parser.add_argument(
        "mei_file_path",
        help="Path to the input MEI file (e.g., input.mei or path/to/file.mei)"
    )
    
    parser.add_argument(
        "mei_id",
        help="The xml:id of the note to annotate (e.g., f1u1s1b6)"
    )
    
    parser.add_argument(
        "onset_time",
        help="The timing value in HH:MM:SS.ms format (e.g., 00:01:30.500)"
    )
    
    args = parser.parse_args()
    
    # Run the annotation
    annotate_mei_note(args.mei_file_path, args.mei_id, args.onset_time)


if __name__ == "__main__":
    main()
