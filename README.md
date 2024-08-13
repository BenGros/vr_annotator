# vr_annotator

This tool can be used to update annotation for a segmentation mask. Once a mask
is loaded in, the annotations can be split into multiple cells or removed. The mask
can then be saved back to the original file.

## Requirements

- Python >= 3.11
- WebXR Browser and compatible headset
- Instance masked stored in JSON (Working on handling ome-zarr)

## Usage

1. Clone the repository into your preferred directory

```
git clone git@github.com:BenGros/vr_annotator.git
```

2. Create and activate a virtual environment, then install dependencies with:

```
pip install .
```

3. Create the web server by running:

```
python backend.py
```

4. Navigate to link and enter the absolute path to your mask or the path relative to backend.py

5. Once image is loaded, put on VR headset and click the enter VR button

## Annotating Tutorial

Once in the VR environment the controllers are used to navigate the annotating process.

### Moving around

The movement is done by squeezing the left controller grip. While squeezing you will move in
the direction of the left controller. So aim where you want to move and then squeeze the controller.
The movement will stop when the squeezing stops.

### Removing an annotated cell

1. Make sure the line attached to your controller intersects a cell

2. Press down on the squeeze part on your controller grip, this should mark the cell by changing its colour to black

3. Continue to mark as many cells as needed for removal

4. To execute the removal press the left controller trigger, and all marked cells should disappear

### Segmenting an annotated cell

1. Make sure the line attached to your controller intersects a cell

2. Press the trigger on the right controller to highlight the cell

   All other cells should disappear and only this cell should be left

3. The cell is split based on markers set by the user

   1. To mark part of the cell for segmenting and keep it use the right trigger

   This will place a white cube at the point of the controller

   2. To mark part of a cell for segmenting and removal use the right squeeze

   This will place a black cube at the point of the controller

   3. Place as many of these markers as required for a cell

4. To execute the segmenting click the left trigger

   The cell should now be segmented but all other cells with still be missing.
   This is because the segmentation still needs to be verified.

   1. If you are happy with the segmentation click the left trigger again.

   2. If the segmentation was not correct click the right squeeze to return to before the segmentation occurred.

#### Notes on Segmenting:

- Segmentation can not be executed until at least two markers are placed

- If a marker is placed outside the cell the entire segmenting process will be aborted and all other cells will be returned

- This means if you did not mean to highlight a cell or place a marker in the wrong spot, ensure there are at least two
  markers placed, with at least one outside of the cell and then execute the segmentation to abort it
