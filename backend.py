from http.server import SimpleHTTPRequestHandler, HTTPServer
import json
import numpy as np
import sys
import importlib
import vr_tool.create_cell_objects
importlib.reload(vr_tool.create_cell_objects)
from vr_tool.create_cell_objects import all, full_segmentation, removeCell, merge_cells, create_image_cells, create_custom_image_cell

# Hold the mask to be saved
mask = None
# Any unapproved updates to mask are here 
updated_mask = None
image = None

class RequestHandler(SimpleHTTPRequestHandler):

    def do_POST(self):
        # make masks global to be able to access constantly
        global mask
        global updated_mask
        global image
        content_length = int(self.headers['Content-Length'])
        data = self.rfile.read(content_length)
        try:
            # Process the received data
            parsed_data = json.loads(data.decode('utf-8'))
            if(parsed_data['action'] == "save"):
                link = parsed_data['link']
                # write out mask
                with open(link, 'w') as f:
                    f.write(json.dumps(mask.tolist()))

                response_message = {'message': 'Saved Successfully.'}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            
            # Used to segment cell into multiple parts
            elif (parsed_data['action'] == "split"):
                # Surrond in try catch to prevent annotation screen to freeze
                try:
                    markers = parsed_data['markers']
                    curr_cell_num = parsed_data['curr_cell']
                    next_cell_num = parsed_data['next_cell']
                    # Return new segmented cells
                    objects = full_segmentation(updated_mask, curr_cell_num, markers, next_cell_num)
                    if(objects == None):
                        response_message= {'message': 'Error', 'objects': None}
                    else:
                        response_message = {'message': 'Data received successfully.', 'objects': objects}
                except:
                    response_message= {'message': 'Error', 'objects': None}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "load"):
                link = parsed_data['mask_link']
                im_link = parsed_data['image_link']
                with open(im_link,'r') as f:
                    image = np.array(json.load(f))[:,:,:]
                    create_image_cells(image)

                with open(link,'r') as f:
                    # load the mask from provided link
                    mask = np.array(json.load(f))[:,:,:]
                    # update the holding mask
                    updated_mask = np.copy(mask)
                    # make the objects and pass the paths to the front end
                    all_obj_paths = all(mask)
                    response_message = {'message': 'Data received successfully.', 'totalMask': mask.tolist(), 'objPaths': all_obj_paths, 'image': image.tolist()}
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "remove"):
                # remove the given cells from the mask
                for ann in parsed_data['remObjects']:
                    mask = removeCell(mask, ann['cellNum'])
                response_message = {'message': 'Data received successfully.'}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "undo"):
                # reset the updated mask to last confirmed change
                updated_mask = np.copy(mask)
                self.send_response(200)
                response_message = {'message': 'Data received successfully.'}
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "complete_segment"):
                # update the good copy of the mask
                mask = np.copy(updated_mask)
                self.send_response(200)
                response_message = {'message': 'Data received successfully.'}
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif(parsed_data['action']=="merge"):
                updated_mask, rdata = merge_cells(updated_mask, parsed_data['cell_nums'])
                mask = np.copy(updated_mask)
                self.send_response(200)
                response_message = {'message': 'Data received successfully.', 'object': rdata['object'], 'cell_nums': rdata['cell_nums'] }
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))

            elif(parsed_data['action']=="newImageCells"):
                isoNormal = parsed_data['isothreshold']
                max = np.amax(image)
                min = np.amin(image)
                iso = max - (isoNormal*(max-min))
                create_image_cells(image, iso)
                self.send_response(200)
                response_message = {'message': 'Data received successfully.'}
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))

            elif(parsed_data['action']=="customImageCell"):
                print(parsed_data)
                min = parsed_data['min_coords']
                max = parsed_data['max_coords']
                iso = parsed_data['iso']
                threshMax = np.amax(image)
                threshMin = np.amin(image)
                iso = threshMax - (iso*(threshMax-threshMin))
                create_custom_image_cell(image, max, min, iso)
                self.send_response(200)
                response_message = {'message': 'Data received successfully.'}
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))

                
                


        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Invalid JSON data received.')



def run_server():
    server_address = ('127.0.0.1', 8080)
    handler = RequestHandler
    RequestHandler.directory = "./vr_tool"
    httpd = HTTPServer(server_address, RequestHandler)
    print('Starting server on http://{}:{}/vr_tool/main.html'.format(server_address[0], server_address[1]))
    httpd.serve_forever()





    

if __name__ == '__main__':
    run_server()