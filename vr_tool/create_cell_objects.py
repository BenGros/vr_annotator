import numpy as np
from scipy import ndimage as ndi
from skimage import segmentation, measure
import pyvista as pv
import os

def get_all_instances(mask):
    """
    This function is used to return all the cell numbers from the mask
    Iterates through the entire mask adds it to a set to ensure we only get one 
    copy of the number
    """
    all_instances = set()
    for num in np.nditer(mask):
        all_instances.add(int(num))
    all_instances = list(all_instances)
    all_instances.sort()
        

    return all_instances


def create_cell_bound_box(mask, cell_num):
    # Create a bounding box within the array for a specfic cell
    max_x = max_y = max_z = -np.inf
    min_x = min_y = min_z = np.inf
    for z_count, z in enumerate(mask):
        for y_count, y in enumerate(z):
            for x_count, x in enumerate(y):
                if(min_x == None):
                    min_x = x_count
                    min_y = y_count
                    min_z = z_count
                if(x == cell_num):
                    if z_count < min_z:
                        min_z = z_count
                    if z_count > max_z:
                        max_z = z_count
                    if y_count < min_y:
                        min_y = y_count
                    if y_count > max_y:
                        max_y = y_count
                    if x_count < min_x:
                        min_x = x_count
                    if x_count > max_x:
                        max_x = x_count
    return min_x, max_x, min_y, max_y, min_z, max_z


def create_cell_mask(mask, bound_box, cell_num):
    # create a mask for the cell within the bounding box area
    cell_mask = np.zeros((int(bound_box[5]-bound_box[4] + 1), int(bound_box[3]-bound_box[2] + 1), int(bound_box[1]-bound_box[0] + 1)), np.int_)
    
    z = bound_box[4]
    new_z = 0
    while(z <= bound_box[5]):
        y = bound_box[2]
        new_y = 0
        while(y <= bound_box[3]):
            x = bound_box[0]
            new_x = 0
            while(x<= bound_box[1]):
                if(mask[z][y][x] == cell_num):
                    cell_mask[new_z][new_y][new_x] = cell_num
                x+=1
                new_x +=1
            y+=1
            new_y +=1
        z+=1
        new_z+=1
    
    return cell_mask

def create_cell_object(cell_mask, save_path):
    # Use Pyvista to create the isosurface for the cell
    # Save the object
    max = 0
    min = 1000000
    for num in np.nditer(cell_mask):
        if(num < min):
            min = num
        if(num > max):
            max = num
    

    if(cell_mask.shape[0]>1 and cell_mask.shape[1]>1 and cell_mask.shape[2] >1):
        try:
            correct_shape_mask = np.transpose(cell_mask, axes=(2,1,0))
            volume = correct_shape_mask.shape[0] * correct_shape_mask.shape[1] * correct_shape_mask.shape[2]
            verts, faces, normals, values = measure.marching_cubes(correct_shape_mask, level=np.amax(cell_mask)/2)
            # Prepare the faces array for PyVista
            faces_pv = np.c_[np.full(len(faces), 3), faces].ravel()
            # Create a PyVista mesh from the marching cubes output
            mesh = pv.PolyData(verts, faces_pv)
            if(volume < 250):
                mesh = mesh.delaunay_3d()
                mesh = mesh.extract_surface()
            else:
                mesh.fill_holes(1000, True)
                mesh.smooth(inplace=True)
                mesh.compute_normals()
            dir_path = "./vr_tool/objects"
            os.makedirs(dir_path, exist_ok=True)
            mesh.save(save_path)
            return True
        except:
            return False
    
    return False

def all(mask):
    print("By")
    # Combine functions to make cell objects for every cell from the mask
    all_obj_paths = []
    all_cell_nums = get_all_instances(mask)

    for cell_num in all_cell_nums:
        obj_info = {"path": None, "min_coords": None, "max_coords": None, "cell_num": cell_num}
        bound_box = create_cell_bound_box(mask, cell_num)
        cell_mask = create_cell_mask(mask, bound_box, cell_num)

        save_path = f"./vr_tool/objects/{cell_num}.obj"
        given_path = f"./objects/{cell_num}.obj"
        obj_info['path'] = given_path
        obj_info['min_coords'] = {"x": bound_box[0], "y": bound_box[2], "z": bound_box[4]}
        obj_info['max_coords'] = {"x": bound_box[1], "y": bound_box[3], "z": bound_box[5]}
        complete = create_cell_object(cell_mask, save_path)
        if(complete):
            all_obj_paths.append(obj_info)
        

    return all_obj_paths


def separate_cells(mask, cell_num, markers, next_cell_num):
    # function used to make a cell mask containing the segmented cells
    all_cell_nums = []
    all_cell_nums.append({"cell_num": cell_num, "remove": markers[0]['remove']})
    bound_box = create_cell_bound_box(mask, cell_num)
    cell_mask = create_cell_mask(mask, bound_box, cell_num)
    marker_mask = np.zeros((cell_mask.shape), np.int_)
    count = 0
    next_c_num = next_cell_num
    
    while(count< len(markers)):
        if(cell_num%15 == next_c_num%15):
            next_c_num+=1
        point = {"z": int(round(markers[count]['z'] - bound_box[4], 0)), "y": int(round(markers[count]['y']- bound_box[2],0)), "x": int(round(markers[count]['x']- bound_box[0],0))}
        print(point)
        if(count == 0):
            if(point['z']-1>=0):
                marker_mask[point["z"]-1][point['y']][point['x']] = cell_num
            if(point['z']+1<(bound_box[5]-bound_box[4])):
                 marker_mask[point["z"]+1][point['y']][point['x']] = cell_num
            marker_mask[point['z']][point['y']][point['x']] = cell_num
        else:
            if(point['z']-1>=0):
                marker_mask[point["z"]-1][point['y']][point['x']] = next_c_num
            if(point['z']+1<(bound_box[5]-bound_box[4])):
                 marker_mask[point["z"]+1][point['y']][point['x']] = next_c_num
            marker_mask[point['z']][point['y']][point['x']]  = next_c_num
            all_cell_nums.append({"cell_num": next_c_num, "remove": markers[count]['remove']})
            next_c_num+=1
        count+=1
            

    # gradient = filters.sobel(cell_mask)
    distance = ndi.distance_transform_edt(cell_mask)
    labels = segmentation.watershed(-distance, marker_mask, mask=cell_mask)
    np.save("mark.npy", marker_mask)
    np.save("cell.npy", cell_mask)
    np.save("arr.npy", labels)
    return labels, all_cell_nums

def update_mask(upmask, labels, original_cell_num, all_cells):
    # Update the holder mask with the segmentation changes
    bound_box = create_cell_bound_box(upmask, original_cell_num)
    new_z = 0
    z = bound_box[4]
    while(z <= bound_box[5]):
        y = bound_box[2]
        new_y = 0
        while(y <= bound_box[3]):
            x = bound_box[0]
            new_x = 0
            while(x<= bound_box[1]):
                cNum = labels[new_z][new_y][new_x]
                rem = find_cell_status(all_cells, cNum)
                # Option to segment and remove a part in one step so then set to 0
                if(rem):
                    upmask[z][y][x] = 0
                else:
                    upmask[z][y][x] = cNum
                x+=1
                new_x +=1
            y+=1
            new_y +=1
        z+=1
        new_z+=1
    return upmask

def make_new_objects(up_mask, updated_cell):
    # Create new objects for the segmented cells
    all_obj_paths = []

    for cell in updated_cell:
        if(not cell['remove']):
            obj_info = {"path": None, "min_coords": None, "max_coords": None, "cell_num": cell['cell_num'], "remove": False}
            bound_box = create_cell_bound_box(up_mask, cell['cell_num'])
            cell_mask = create_cell_mask(up_mask, bound_box, cell['cell_num'])


            save_path = f"./vr_tool/objects/{cell['cell_num']}.obj"
            given_path = f"./objects/{cell['cell_num']}.obj"
            obj_info['path'] = given_path
            obj_info['min_coords'] = {"x": bound_box[0], "y": bound_box[2], "z": bound_box[4]}
            obj_info['max_coords'] = {"x": bound_box[1], "y": bound_box[3], "z": bound_box[5]}
            complete = create_cell_object(cell_mask, save_path)
            if(complete):
                all_obj_paths.append(obj_info)
            else:
                return None
        else:
            obj_info = {"cell_num": cell['cell_num'], "remove": True}
            all_obj_paths.append(obj_info)
        
    return all_obj_paths

def removeCell(mask, cellNum):
    # Remove a cell from the mask
    for num in np.nditer(mask, op_flags=['readwrite']):
        if(num == cellNum):
            num[...] = 0
    return mask

def find_cell_status(all_cells, cell_num):
    # Find out if the segmented cell is to be removed or not
    for cell in all_cells:
        if(cell_num == cell['cell_num']):
            return cell['remove']


def full_segmentation(umask, cell_num, markers, next_cell_num):
    # Combine all function for segmenting
    new_cells = separate_cells(umask, cell_num, markers, next_cell_num)
    umask = update_mask(umask, new_cells[0],  cell_num, new_cells[1])
    objects = make_new_objects(umask, new_cells[1])
    return objects


def merge_cells(mask, cell_nums):
    """
    Used to combine two or more cells into one 
    First combines them on the array and then will create the mask
    for the new cell and produce the object from there
    """
    for num in np.nditer(mask, op_flags=['readwrite']):
        if(num in cell_nums):
            num[...] = cell_nums[0]

    
    obj_info = {"path": f"./objects/{cell_nums[0]}.obj", "min_coords": None, "max_coords": None, "cell_num": cell_nums[0]}
    
    box = create_cell_bound_box(mask, cell_nums[0])
    c_mask = create_cell_mask(mask, box, cell_nums[0])
    create_cell_object(c_mask, f"./vr_tool/objects/{cell_nums[0]}.obj")

    obj_info['min_coords'] = {"x": box[0], "y": box[2], "z": box[4]}
    obj_info['max_coords'] = {"x": box[1], "y": box[3], "z": box[5]}

    return_data = {'object': obj_info, 'cell_nums': cell_nums}

    return mask, return_data


def create_image_cells(image, isothreshold=-1):
    if(isothreshold < 0):
        level = (np.amax(image) + np.amin(image))/2
    else:
        level = isothreshold
    correct_shape_mask = np.transpose(image, axes=(0,2,1))
    verts, faces, normals, values = measure.marching_cubes(correct_shape_mask, level=level)
    # Prepare the faces array for PyVista
    faces_pv = np.c_[np.full(len(faces), 3), faces].ravel()
    # Create a PyVista mesh from the marching cubes output
    mesh = pv.PolyData(verts, faces_pv)
    mesh.fill_holes(10000, True)
    mesh.smooth(inplace=True)
    mesh.compute_normals()
    mesh.point_data['scalars'] = values
    p = pv.Plotter()
    p.add_mesh(mesh, scalars='scalars', cmap='viridis')
    dir_path = "./vr_tool/objects"
    os.makedirs(dir_path, exist_ok=True)
    p.export_gltf("./vr_tool/objects/image.gltf")


def create_custom_image_cell(image, max, min, iso):
    partial_image = image[min['z']:max['z'], min['y']:max['y'], min['x']:max['x']]
    correct_shape_mask = np.transpose(partial_image, axes=(0,2,1))
    verts, faces, normals, values = measure.marching_cubes(correct_shape_mask, level=iso)
    # Prepare the faces array for PyVista
    faces_pv = np.c_[np.full(len(faces), 3), faces].ravel()
    # Create a PyVista mesh from the marching cubes output
    mesh = pv.PolyData(verts, faces_pv)
    mesh.fill_holes(10000, True)
    mesh.smooth(inplace=True)
    mesh.compute_normals()
    mesh.point_data['scalars'] = values
    p = pv.Plotter()
    p.add_mesh(mesh, scalars='scalars', cmap='viridis')
    dir_path = "./vr_tool/objects"
    p.export_gltf("./vr_tool/objects/image.gltf")

