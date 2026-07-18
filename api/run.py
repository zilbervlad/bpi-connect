import os

from app import create_app, socketio

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5050"))

    socketio.run(
        app,
        debug=False,
        host="0.0.0.0",
        port=port,
        allow_unsafe_werkzeug=True,
    )
