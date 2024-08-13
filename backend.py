from http.server import SimpleHTTPRequestHandler, HTTPServer
import json
import numpy as np

from vr_tool.create_cell_objects import all, full_segmentation, removeCell

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
                # write out mask
                with open(link,'r') as f:
                    whole_mask = np.array(json.load(f))
                    whole_mask[:,:,:] = mask

                with open("file.json", 'w') as f:
                    f.write(json.dumps(whole_mask))

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
                    response_message = {'message': 'Data received successfully.', 'objects': objects}
                except:
                    response_message= {'message': 'Error', 'objects': None}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "load"):
                print(parsed_data)
                link = parsed_data['mask_link']
                im_link = parsed_data['image_link']
                with open(im_link,'r') as f:
                    image = np.array(json.load(f))[:,:,:]

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
    print('Starting server on http://{}:{}'.format(server_address[0], server_address[1]))
    httpd.serve_forever()





    

if __name__ == '__main__':
    run_server()