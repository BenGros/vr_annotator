from http.server import SimpleHTTPRequestHandler, HTTPServer, BaseHTTPRequestHandler
import cgi
import json
import numpy as np

print(2+2)
class RequestHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        print(self.path)
        content_length = int(self.headers['Content-Length'])
        data = self.rfile.read(content_length)
        try:
            # Process the received data (assuming JSON for example)
            parsed_data = json.loads(data.decode('utf-8'))
            # Here you can handle or process the parsed_data as needed
            mask = parsed_data['data']
            print(parsed_data['filename'])
            with open("file.json", 'w') as f:
                f.write(json.dumps(mask))
            response_message = {'message': 'Data received successfully.'}
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
    httpd = HTTPServer(server_address, RequestHandler)
    print('Starting server on http://{}:{}'.format(server_address[0], server_address[1]))
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()