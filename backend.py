from http.server import SimpleHTTPRequestHandler, HTTPServer, BaseHTTPRequestHandler
import json
import numpy as np
import matplotlib.pyplot as plt
from scipy import ndimage as ndi
from skimage import filters, segmentation

class RequestHandler(SimpleHTTPRequestHandler):
    
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        data = self.rfile.read(content_length)
        try:
            # Process the received data
            parsed_data = json.loads(data.decode('utf-8'))
            if(parsed_data['action'] == "save"):
                # write out mask
                mask = parsed_data['data']
                with open("file.json", 'w') as f:
                    f.write(json.dumps(mask))

                response_message = {'message': 'Data received successfully.'}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_message).encode('utf-8'))
            elif (parsed_data['action'] == "split"):
                mask = np.array(parsed_data['mask'])
                markers = np.zeros(mask.shape, np.int_)
                marker_positions = parsed_data['cells']
                print(marker_positions)
                next_cell_num = parsed_data['nextCell']
                curr_cell_num = parsed_data['currCell']
                first = True
                for mark in marker_positions:
                    if(first):
                        markers[(mark['z'], mark['y'],mark['x'])] = curr_cell_num
                        first = False
                    else:
                        markers[(mark['z'], mark['y'],mark['x'])] = next_cell_num
                        next_cell_num +=1

                np.set_printoptions(threshold=np.inf)
                gradient = filters.sobel(mask)
                labels = segmentation.watershed(gradient, markers, mask=mask)
                print(labels)

                response_message = {'message': 'Data received successfully.', 'labels': labels.tolist()}
                self.send_response(200)
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