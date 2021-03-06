class Net {
  constructor(game) {
    this.game             = game;
    this.id               = undefined;
    this.init             = false;
    this.isLookingForRoom = false;
    this.pseudo            = '';
    this.room              = undefined;
    this.startTime         = undefined;
    this.latency           = 0;
    this.messages          = [];
    this.pending_inputs    = [];
    this.input_sequence_number = 0;

    this.socket = io.connect("https://trackball-game.com:8080", {
      forceNew: true
    });

    this.socket.on('pongto', () => {
      this.latency = +Date.now() - this.startTime;
    });


    this.socket.on('connect_error', () => {
        // if (this.room != undefined) {
        //     document.querySelector(".menu").style.display = "block";
        //     document.querySelector(".network-ready .state").innerHTML = "Press enter to looking for a game";
        //     game.stop();
        // }
        //
        // document.querySelector(".network-ready").style.display = 'none';
        // document.querySelector(".network-not-ready").style.display = 'block';
        //
        // document.querySelector(".network-not-ready").innerHTML = "Server offline";
    });

    this.socket.on('reconnecting', (n) => {
        document.querySelector(".network-not-ready").innerHTML = "Try reconnecting #" + n;
    });

    this.socket.on('connected', (id) => {
        document.querySelector(".network-ready").style.display = 'block';
        document.querySelector(".network-not-ready").style.display = 'none';

        this.id = id;
    });

    this.socket.on('UpdateNumberPlayer', (numberPlayer) => {
      game.ui.updateLeftPlayer(numberPlayer);
    });

    this.socket.on('UpdateKill', (numberKill) => {
      game.ui.updateKill(numberKill);
    });

    this.socket.on('JoinedRoom', (room) => {
        this.room = room;

        document.querySelector(".network-ready .state").innerHTML = "Room #" + room.id + "<br />Waiting for other players (" + room.numberPlayer + "/" + room.maxPlayer + ")";
    });

    this.socket.on('Message', (message) => {
      game.ui.addMessage(message);
    })

    this.socket.on('spawnPlayer', (data) => {
        game.width  = data.map.width;
        game.height = data.map.height;

        game.start();

        let tank = new Player(data.player.id, game, data.player.pos);
        tank.pseudo = data.player.pseudo;
        game.tanks[data.player.id] = tank;

        // game.camera.setTarget(game.tanks[data.player.id], game.canvas.width / 2, game.canvas.height / 2);

        this.init = true;
        this.id = data.player.id;
        this.roomID = this.room.id;

        document.querySelector(".menu").style.display = "none";
        document.querySelector(".in-game").style.display = "block";

    });

    this.socket.on('addPlayer', (data) => {
      let tank = new Ennemy(data.player.id, game, data.player.pos);
      tank.pseudo = data.player.pseudo;
      game.tanks[data.player.id] = tank;
    });

    this.socket.on('1', (data) => {
      var recv_ts = +new Date();
        this.messages.push({
            recv_ts: recv_ts + data.lag,
            payload: data.world_state
        });

      //   if (data.id == this.id) {
      //       return;
      //   }
      //
      // if (game.tanks[data.id] != undefined) {
      //   game.tanks[data.id].pos.x = data.x;
      //   game.tanks[data.id].pos.y = data.y;
      //   game.tanks[data.id].angle = data.angle;
      //   game.tanks[data.id].canonAngle = data.canonAngle;
      //   game.tanks[data.id].posCanon = data.posCanonServer;
      //   game.tanks[data.id].colliderPoint = data.colliderPointServer;
      // }
    });

    this.socket.on('Shoot', (data) => {
        game.bullets[data.bulletid] = data;
    });

    this.socket.on("Bullet", (data) => {
        game.bullets[data.id].sprite.x = data.pos.x;
        game.bullets[data.id].sprite.y = data.pos.y;
    });

    this.socket.on("HitPlayer", (hit) => {
        game.tanks[hit.playerID].life = hit.player.life;
        game.tanks[hit.playerID].isAlive = hit.player.isAlive;

        delete game.bullets[hit.bulletID];

        // Delete tank
        if (!hit.player.isAlive) {
          if (hit.playerID != this.id) {
            delete game.tanks[hit.playerID];
          } else {
            game.ui.displayTop(hit.player.top);
            game.tanks[hit.playerID].isSpectator = true;
          }
        }

    });

      this.socket.on("Winner", (winner) => {
        if (this.id == winner.id) {
          game.ui.displayTop(winner.top);
        }
      });

    this.socket.on("MissileDelete", (missile) => {
        for (var key in game.bullets) {
            if( game.bullets[key].bulletid == missile.bulletid) {
                delete game.bullets[key];
                break;
            }
        }
    });

    this.socket.on("RemovePlayer", (data) => {
      delete game.tanks[data.id];
    });
  }

  updatePos(data) {
      data.roomID = this.room.id;
      this.socket.emit('UpdatePlayerPosition', data);
  }

  Shoot(data) {
      data.roomID = this.room.id;
      this.socket.emit('Shoot', data);
  }

  lookingForRoom(pseudo) {
      if (!this.isLookingForRoom) {
          this.isLookingForRoom = true;
          document.querySelector(".network-ready .state").innerHTML = "Looking for room...";

          this.pseudo = pseudo ? pseudo : document.querySelector(".pseudo").value;

          this.socket.emit('JoinRoom', {
              id: this.id,
              pseudo: this.pseudo,
          } );
      }
  }

  reset() {
      this.isLookingForRoom = false;
      this.room = undefined;
  }

  start(roomID) {
    this.socket.emit('Start', roomID);
  }

  update() {
    this.startTime = +Date.now();
    this.socket.emit('pingto');

    this.processServerMessage();
    this.processInput();
    this.interpolateEntities();
  }

  processServerMessage() {
    while (true) {
        var messages = this.getAvailableMessage();

        if (!messages) {
            break;
        }

        // World state is a list of entity states.
        for (var i = 0; i < messages.length; i++) {
            var state = messages[i];

            var entity = this.game.tanks[state.id];

            if (state.id == this.id) {

              // C'est moi
                // Received the authoritative position of this client's entity.
                entity.pos.x = state.x;
                entity.pos.y = state.y;
                entity.angleMove = state.angleMove;
                entity.angle = state.angle;
                entity.canonAngle = state.canonAngle;
                entity.colliderPoint = state.colliderPoint;
                entity.colliderPointServer = state.colliderPointServer;

                var j = 0;
                while (j < this.pending_inputs.length) {
                    var input = this.pending_inputs[j];
                    if (input.input_sequence_number <= state.last_processed_input) {
                        // Already processed. Its effect is already taken into account into the world update
                        // we just got, so we can drop it.
                        this.pending_inputs.splice(j, 1);
                    } else {
                        // Not processed by the server yet. Re-apply it.
                        entity.applyInput(input);
                        j++;
                    }
                }
            } else {
              // C'est eux
                // Received the position of an entity other than this client's.

                if( entity ) {
                    // Add it to the position buffer.
                    var timestamp = +new Date();
                    entity.position_buffer.push([timestamp, state.x, state.y, state.angle, state.angleMove, state.canonAngle, state.colliderPoint, state.colliderPointServer]);
                }
            }
        }
    }
  }

  getAvailableMessage() {
      let now = +new Date();
      for (let i = 0; i < this.messages.length; i++) {
          let message = this.messages[i];
          if (message.recv_ts <= now) {
              this.messages.splice(i, 1);
              return message.payload;
          }
      }
  }

  processInput() {
    var now_ts = +new Date();
    var last_ts = this.last_ts || now_ts;
    var dt_sec = (now_ts - last_ts) / 1000.0;
    this.last_ts = now_ts;

    // Package player's input.
    var input = {};

    input.up_press_time = 0;
    input.left_press_time = 0;
    input.right_press_time = 0;

    if (this.game.input.keyPressed.up) {
      input.up_press_time = dt_sec;
    }

    if (this.game.input.keyPressed.left) {
      input.left_press_time = dt_sec;
    }

    if (this.game.input.keyPressed.right) {
      input.right_press_time = dt_sec;
    }

    this.game.tanks[this.id].update();

    input.canonAngle = this.game.tanks[this.id].canonAngle;
    input.posCanonServer = this.game.tanks[this.id].posCanonServer;
    input.colliderPoint = this.game.tanks[this.id].colliderPoint;
    input.colliderPointServer = this.game.tanks[this.id].colliderPointServer;
    input.shoot = this.game.tanks[this.id].shoot;


    // Send the input to the server.
    input.input_sequence_number = this.input_sequence_number++;
    input.id = this.id;
    input.room_id = this.room.id;
    input.lag = this.latency;
    this.socket.emit(0, input);

    this.game.tanks[this.id].shoot = false;
    this.game.tanks[this.id].applyInput(input);

    this.pending_inputs.push(input);
  }

  interpolateEntities() {
    //Compute render timestamp.
      var now = +new Date();
      var render_timestamp = now - (1000.0 / 10);
      for (var i in this.game.tanks) {
          var entity = this.game.tanks[i];

          // No point in interpolating this client's entity.
          if (entity.id == this.id) {
              continue;
          }

          // Find the two authoritative positions surrounding the rendering timestamp.
          var buffer = entity.position_buffer;

          // Drop older positions.
          while (buffer.length >= 2 && buffer[1][0] <= render_timestamp) {
              buffer.shift();
          }

          // Interpolate between the two surrounding authoritative positions.
          if (buffer.length >= 2 && buffer[0][0] <= render_timestamp && render_timestamp <= buffer[1][0]) {
              var x0 = buffer[0][1];
              var x1 = buffer[1][1];
              var y0 = buffer[0][2];
              var y1 = buffer[1][2];
              var t0 = buffer[0][0];
              var t1 = buffer[1][0];
              var angle0 = buffer[0][3];
              var angle1 = buffer[1][3];
              var angleMove0 = buffer[0][4];
              var angleMove1 = buffer[1][4];
              var canonAngle0 = buffer[0][5];
              var canonAngle1 = buffer[1][5];
              var colliderPoint0 = buffer[0][6];
              var colliderPoint1 = buffer[1][6];
              var colliderPointServer0 = buffer[0][7];
              var colliderPointServer1 = buffer[1][7];

              entity.pos.x = x0 + (x1 - x0) * (render_timestamp - t0) / (t1 - t0);
              entity.pos.y = y0 + (y1 - y0) * (render_timestamp - t0) / (t1 - t0);
              entity.angle = angle0 + (angle1 - angle0) * (render_timestamp - t0) / (t1 - t0);
              entity.angleMove = angleMove0 + (angleMove1 - angleMove0) * (render_timestamp - t0) / (t1 - t0);
              entity.canonAngle = canonAngle0 + (canonAngle1 - canonAngle0) * (render_timestamp - t0) / (t1 - t0);
              entity.colliderPoint = colliderPoint0 + (colliderPoint1 - colliderPoint0) * (render_timestamp - t0) / (t1 - t0);
              entity.colliderPointServer = colliderPointServer0 + (colliderPointServer1 - colliderPointServer0) * (render_timestamp - t0) / (t1 - t0);
          }
      }
  }
}
