import numpy as np
from skimage import measure
import pyvista as pv
from scipy import ndimage as ndi
from skimage import filters, segmentation, measure
import pyvista as pv
import json

def get_all_instances(mask):
    all_instances = []
    for num in np.nditer(mask):
        if(num > 0 and (num not in all_instances)):
            num = int(num)
            all_instances.append(num)

    return all_instances


def create_cell_bound_box(mask, cell_num):
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
    print(bound_box)
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
    if(cell_mask.shape[0]>1 and cell_mask.shape[1]>1 and cell_mask.shape[2] >1):
        correct_shape_mask = np.transpose(cell_mask, axes=(2,1,0))
        verts, faces, normals, values = measure.marching_cubes(correct_shape_mask, level=0.5)
        # Prepare the faces array for PyVista
        faces_pv = np.c_[np.full(len(faces), 3), faces].ravel()
        # # Create a PyVista mesh from the marching cubes output
        mesh = pv.PolyData(verts, faces_pv)
        mesh.fill_holes(1000, True)
        mesh.smooth(inplace=True)
        mesh.compute_normals()
        mesh.save(save_path)
        return True
    
    return False

def all(mask):
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

def calculate_midpoint(pos1, pos2):
    return ((pos2-pos1)/2)+pos1


def separate_cells(mask, cell_num, markers, next_cell_num):
    all_cell_nums = []
    all_cell_nums.append({"cell_num": cell_num, "remove": markers[0]['remove']})
    bound_box = create_cell_bound_box(mask, cell_num)
    print(bound_box)
    cell_mask = create_cell_mask(mask, bound_box, cell_num)
    marker_mask = np.zeros((cell_mask.shape), np.int_)
    count = 0
    next_c_num = next_cell_num
    while(count< len(markers)):
        point = {"z": int(round(markers[count]['z'] - bound_box[4], 0)), "y": int(round(markers[count]['y']- bound_box[2],0)), "x": int(round(markers[count]['x']- bound_box[0],0))}
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
            

    gradient = filters.sobel(cell_mask)
    distance = ndi.distance_transform_edt(cell_mask)
    labels = segmentation.watershed(-distance, marker_mask, mask=cell_mask)
    np.save("mark.npy", marker_mask)
    np.save("grad.npy", gradient)
    np.save("cell.npy", cell_mask)
    np.save("arr.npy", labels)
    return labels, all_cell_nums

def update_mask(mask, labels, original_cell_num):
    bound_box = create_cell_bound_box(mask, original_cell_num)
    new_z = 0
    z = bound_box[4]
    while(z <= bound_box[5]):
        y = bound_box[2]
        new_y = 0
        while(y <= bound_box[3]):
            x = bound_box[0]
            new_x = 0
            while(x<= bound_box[1]):
                mask[z][y][x] = labels[new_z][new_y][new_x]
                x+=1
                new_x +=1
            y+=1
            new_y +=1
        z+=1
        new_z+=1
    return mask

def make_new_objects(up_mask, updated_cell):
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
            obj_info = {"cell_num": cell['cell_num'], "remove": True}
            all_obj_paths.append(obj_info)
        
    return all_obj_paths

def removeCell(mask, cellNum):
    for num in np.nditer(mask, op_flags=['readwrite']):
        if(num == cellNum):
            num[...] = 0
    return mask


def full_segmentation(mask, cell_num, markers, next_cell_num):
    new_cells = separate_cells(mask, cell_num, markers, next_cell_num)
    new_mask = mask
    updated_mask = update_mask(new_mask, new_cells[0],  cell_num)
    objects = make_new_objects(updated_mask, new_cells[1])
    return objects

