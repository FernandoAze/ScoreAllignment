#!/usr/bin/env python3
"""
Extract timing annotations from a MEI file and export to UAI format using modusa.

Reads a .mei file, collects all elements with `when` attributes, converts times
to seconds, and exports as Audacity label format (UAI-compatible .txt).

Output format (tab-separated):
    start_time(s)\tend_time(s)\tlabel

Usage:
    python 0009_meiToTimeInstance.py input.mei
    python 0009_meiToTimeInstance.py input.mei -o output_times.txt

Requires:
    pip install modusa
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import List
from xml.etree import ElementTree as ET

try:
    from modusa.models import annotation as modusa_annotation
    from modusa.save.annotation import as_audacity_labels
except ImportError:
    print("Error: modusa library not found. Install it with: pip install modusa", file=sys.stderr)
    sys.exit(1)

MEI_NAMESPACE = "http://www.music-encoding.org/ns/mei"
XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"
namespaces = {"mei": MEI_NAMESPACE, "xml": XML_NAMESPACE}


def load_mei_file(path: str) -> ET.ElementTree:
    """Load and parse a MEI file with proper namespace handling."""
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    tree = ET.parse(path)
    return tree


def when_to_seconds(when_str: str) -> float:
    """
    Convert a MEI `when` attribute to seconds.
    
    Supports formats:
    - ISO 8601-like: 00:01:30.500 -> 90.5 seconds
    - Decimal seconds: 90.5 -> 90.5 seconds
    - Beat-based (with integer): 60 -> 60.0 seconds
    
    Args:
        when_str: String representation of time
        
    Returns:
        Time in seconds as float
    """
    when_str = str(when_str).strip()
    
    # If it's already a number, return as float
    try:
        return float(when_str)
    except ValueError:
        pass
    
    # Try to parse HH:MM:SS.ms format
    time_pattern = r"(\d+):(\d+):(\d+(?:\.\d+)?)"
    match = re.match(time_pattern, when_str)
    if match:
        hours, minutes, seconds = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    
    # Fallback: assume it's a beat or offset value, try to parse as float
    try:
        return float(when_str.replace(",", "."))  # Handle locale-specific decimal
    except ValueError:
        raise ValueError(f"Could not parse 'when' value: {when_str}")


def short_label_for_element(elem: ET.Element) -> str:
    """Generate a short, readable label for an MEI element."""
    # Prefer explicit label/name attributes
    for attr in ("label", "name", "n"):
        val = elem.get(attr)
        if val:
            return str(val)

    # Extract local name from tag (handles {namespace}localname format)
    tag_str = str(elem.tag)  # Ensure it's a string, not QName
    tag = tag_str.split('}')[-1] if '}' in tag_str else tag_str

    # Helpful shorthand for notes: pname+oct
    if tag == "note":
        pname = elem.get("pname", "")
        octv = elem.get("oct") or elem.get("octave", "")
        if pname and octv:
            return f"note_{pname}{octv}"
        if pname:
            return f"note_{pname}"

    # Fallback to tag name
    return f"{tag}"


def collect_when_annotations(tree: ET.ElementTree) -> list[tuple]:
    """
    Extract all elements with `when` attributes from MEI as time instances.
    
    Creates point-in-time annotations where start_time equals end_time.
    
    Returns a list of tuples compatible with modusa.Annotation:
        (uttid, ch, time_instance, time_instance, label, confidence, group)
    """
    root = tree.getroot()
    ET.register_namespace("mei", MEI_NAMESPACE)

    annotations: list[tuple] = []

    for elem in root.iter():
        when = elem.get("when")
        if when is None:
            continue

        # Extract xml:id or use a generated id
        xml_id = elem.get(f"{{{XML_NAMESPACE}}}id") or elem.get("id")
        if not xml_id:
            # Generate a fallback id based on tag and position
            tag_str = str(elem.tag)  # Ensure it's a string, not QName
            local_tag = tag_str.split('}')[-1] if '}' in tag_str else tag_str
            xml_id = f"{local_tag}_{len(annotations)}"

        # Use the element's id as the label
        label = xml_id
        
        # Convert when attribute to seconds as a point-in-time instance
        try:
            time_instance = when_to_seconds(when)
        except ValueError as e:
            print(f"⚠ Skipping element {xml_id}: {e}", file=sys.stderr)
            continue

        # modusa annotation tuple: (uttid, ch, start, end, label, confidence, group)
        # Time instances have identical start and end times (point events)
        annotation_tuple = (
            xml_id,          # uttid
            0,               # ch (channel, 0 for single-channel)
            time_instance,   # start_time (seconds) — point event
            time_instance,   # end_time (identical for point events)
            label,           # label
            1.0,             # confidence (1.0 = certain)
            0                # group (0 = default group)
        )
        annotations.append(annotation_tuple)

    return annotations


def export_as_uai_txt(annotations: list[tuple], output_path: str, source_mei: str) -> None:
    """
    Export time instances as a simple tab-separated format (time_instance, label).
    
    Writes one time instance per line in the format:
        time_instance(s)\tlabel
    """
    try:
        with open(output_path, 'w') as f:
            for annotation in annotations:
                # annotation tuple: (uttid, ch, time_instance, time_instance, label, confidence, group)
                time_instance = annotation[2]  # start_time (which equals end_time)
                label = annotation[4]           # label
                f.write(f"{time_instance}\t{label}\n")
        
        print(f"✓ Exported {len(annotations)} time instances to: {output_path}")
    except Exception as e:
        print(f"Error exporting annotations: {e}", file=sys.stderr)
        raise


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract MEI `when` attributes and export to UAI format using modusa"
    )
    parser.add_argument("mei_file", help="Input MEI file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output .txt file in Audacity labels format (defaults to <input>_times.txt)"
    )

    args = parser.parse_args(argv)

    mei_path = args.mei_file
    
    # Load and parse MEI file
    try:
        tree = load_mei_file(mei_path)
    except FileNotFoundError:
        print(f"Error: MEI file not found: {mei_path}", file=sys.stderr)
        return 2
    except ET.ParseError as e:
        print(f"Error: Failed to parse MEI file: {e}", file=sys.stderr)
        return 3

    # Collect when annotations
    try:
        annotations = collect_when_annotations(tree)
    except Exception as e:
        print(f"Error collecting annotations: {e}", file=sys.stderr)
        return 4

    if not annotations:
        print("Warning: No elements with 'when' attribute found in MEI file.", file=sys.stderr)
        return 1

    # Determine output file path
    if args.output:
        out_file = args.output
    else:
        p = Path(mei_path)
        out_file = str(p.with_name(p.stem + "_times.txt"))

    # Export using modusa's UAI format
    try:
        export_as_uai_txt(annotations, out_file, mei_path)
    except Exception as e:
        print(f"Error exporting annotations: {e}", file=sys.stderr)
        return 5

    print(f"✓ Processing complete!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
