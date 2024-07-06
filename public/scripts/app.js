// Set up basic variables for app
const record = document.querySelector(".record");
const stop = document.querySelector(".stop");
const soundClips = document.querySelector(".sound-clips");
const canvas = document.querySelector(".visualizer");
const mainSection = document.querySelector(".main-controls");

// Disable stop button while not recording
stop.disabled = true;

// Visualiser setup - create web audio api context and canvas
let audioCtx;
const canvasCtx = canvas.getContext("2d");

// delete button action: delete the clip from the UI and the server
function deleteAction(e) {
  const clip = e.target.closest(".clip");
  const audio = clip.querySelector("audio");
  if (audio.src.startsWith("blob:")) {
    window.URL.revokeObjectURL(audio.src);
  } else {
    fetch(audio.src, { method: "DELETE" });
  }
  clip.remove();
}

// click on name action: rename the clip
// click on name action: rename the clip
async function renameAction(e) {
  const clipLabel =e.target;
  const existingName = clipLabel.textContent;
  const newClipName = prompt("Enter a new name for your sound clip?");
  if (newClipName === null || newClipName === "") {
    clipLabel.textContent = existingName;
  } else {
    clipLabel.textContent = newClipName;

    const clip = e.target.closest(".clip");
    const audio = clip.querySelector("audio");
    if (!audio.src.startsWith("blob:")) {
      // not exactly the most efficient as it actually downloads and
      // re-uploads the audio, but it works...
      clip.style.opacity = 0.5;
      let response = await fetch(audio.src);
      if (response.ok) {
        response = await fetch("/audio/" + encodeURI(newClipName), {
          method: "PUT",
          body: response.body,
          headers: {
            "Content-Type": response.headers.get("Content-Type"),
          },
        });

        if (response.ok) {
          await fetch("/audio/" + encodeURI(existingName), {
            method: "DELETE"
          });

          clip.style.opacity = 1;
        }
      }
    }
  }
};

// Main block for doing the audio recording
if (navigator.mediaDevices.getUserMedia) {
  console.log("The mediaDevices.getUserMedia() method is supported.");

  const constraints = { audio: true };
  let chunks = [];

  let onSuccess = function (stream) {
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm; codecs=opus",
    });

    visualize(stream); 

    record.onclick = function () {
      mediaRecorder.start();
      console.log(mediaRecorder.state);
      console.log("Recorder started.");
      record.style.background = "red";

      stop.disabled = false;
      record.disabled = true;
    };

    stop.onclick = function () {
      mediaRecorder.stop();
      console.log(mediaRecorder.state);
      console.log("Recorder stopped.");
      record.style.background = "";
      record.style.color = "";

      stop.disabled = true;
      record.disabled = false;
    };

    mediaRecorder.onstop = function (e) {
      console.log("Last data to read (after MediaRecorder.stop() called).");

      const clipName = prompt(
        "Enter a name for your sound clip?",
        "My unnamed clip"
      );

      const clipContainer = document.createElement("article");
      const clipLabel = document.createElement("p");
      const audio = document.createElement("audio");
      const deleteButton = document.createElement("button");

      clipContainer.classList.add("clip");
      audio.setAttribute("controls", "");
      deleteButton.textContent = "Delete";
      deleteButton.className = "delete";

      if (clipName === null) {
        clipLabel.textContent = "My unnamed clip";
      } else {
        clipLabel.textContent = clipName;
      }

      clipContainer.appendChild(audio);
      clipContainer.appendChild(clipLabel);
      clipContainer.appendChild(deleteButton);
      clipContainer.style.opacity = 0.5;
      soundClips.appendChild(clipContainer);

      audio.controls = true;
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      chunks = [];
      const audioURL = window.URL.createObjectURL(blob);
      audio.src = audioURL;
      console.log("recorder stopped");

      fetch("/audio/" + encodeURI(clipLabel.textContent), {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type": mediaRecorder.mimeType,
        }
      }).then(response => {
        clipContainer.style.opacity = 1;
        audio.preload = "none";
        audio.type = mediaRecorder.mimeType;
        audio.src = response.url;

        window.URL.revokeObjectURL(audioURL);
      });

      deleteButton.onclick = deleteAction;

      clipLabel.onclick = renameAction;
    };

    mediaRecorder.ondataavailable = function (e) {
      chunks.push(e.data);
    };
  };

  let onError = function (err) {
    console.log("The following error occured: " + err);
  };

  navigator.mediaDevices.getUserMedia(constraints).then(onSuccess, onError);
} else {
  console.log("MediaDevices.getUserMedia() not supported on your browser!");
}

function visualize(stream) {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }

  const source = audioCtx.createMediaStreamSource(stream);

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  source.connect(analyser);

  draw();

  function draw() {
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = "rgb(200, 200, 200)";
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(0, 0, 0)";

    canvasCtx.beginPath();

    let sliceWidth = (WIDTH * 1.0) / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      let v = dataArray[i] / 128.0;
      let y = (v * HEIGHT) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }
}

window.onresize = function () {
  canvas.width = mainSection.offsetWidth;
};

window.onresize();

document.addEventListener('DOMContentLoaded', () => {
  const clips = document.querySelectorAll('.sound-clips .clip');
  for (const clip of clips) {
    clip.querySelector('.delete').onclick = deleteAction;
    clip.querySelector('p').onclick = renameAction;
  } 
})