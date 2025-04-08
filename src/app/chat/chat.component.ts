import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import SockJS from 'sockjs-client';
import * as Stomp from 'stompjs';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import 'webrtc-adapter';

interface ChatMessage {
  senderId: string;
  senderName: string;
  receiverId: string;
  content: string;
  createdDate?: Date;
  type: 'CHAT' | 'OFFER' | 'ANSWER' | 'ICECANDIDATE' | 'REJECT';
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy {
  stompClient: any;
  selectedFriendId: string | null = null;
  userId: string | null = null;
  email: string | null = null;
  friends: any[] = [];
  selectedFriend: any | null = null;
  messages: ChatMessage[] = [];
  messageInput = '';
  friendMap: { [key: string]: string } = {};
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  peerConnection: RTCPeerConnection | null = null;
  isCalling: boolean = false;
  callInProgressWith: string | null = null;
  isIncomingCall: boolean = false;
  incomingCallerId: string | null = null;
  incomingCallerName: string | null = null;
  incomingCallOffer: RTCSessionDescriptionInit | null = null;
  ringtoneAudio: HTMLAudioElement | null = null;

  @ViewChild('localVideo') localVideo: ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('remoteVideo') remoteVideo: ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('remoteAudio') remoteAudio: ElementRef<HTMLAudioElement> | undefined;
  @ViewChild('chatContainer') private chatContainer!: ElementRef;


  private readonly iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Add more STUN/TURN servers as needed
    ],
  };

  constructor(private http: HttpClient) {}

   async ngOnInit() {
    await this.initChat(); // Call initChat to establish the connection and subscribe
    await this.loadFriends();
    this.ringtoneAudio = new Audio('assets/mixkit-marimba-waiting-ringtone-1360.wav');
    this.ringtoneAudio.loop = true;

    // The subscription logic is now inside the connect() callback
    // You no longer need the if (this.stompClient) block here
  }

  ngOnDestroy() {
    if (this.stompClient && this.stompClient.connected) {
      this.stompClient.disconnect();
    }
    this.stopMediaStreams();
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  async getUserMailFromToken() {
    const token = this.getToken();
    if (token) {
      try {
        const payloadBase64 = token.split(".")[1];
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        this.email = payload.sub;

        if (this.email) {
          this.userId = await this.getUserId(this.email);
        } else {
          console.error("Email không được tìm thấy trong token.");
          return null;
        }
        return this.email; // Return email instead of payload.sub
      } catch (error) {
        console.error("Lỗi giải mã token:", error);
        return null;
      }
    }
    return null;
  }


  // auto cuộn xuống dưới khi có tin nhắn mới
  ngAfterViewInit() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  // Gọi hàm này mỗi khi có tin nhắn mới
  onNewMessage(): void {
    // Thêm message vào danh sách
    this.scrollToBottom();
  }
  //

  selectFriend(friend: any) {
    this.selectedFriendId = friend.friendId;
    this.selectedFriend = friend; 
    this.loadChatHistory(friend.friendId);
  }

  async getUserId(email: string) {
    const token = this.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    try {
      const response = await this.http.get<any>(`http://localhost:8989/api/v1/users/find-by-email/${email}`, { headers }).toPromise();
      return response.data.id;
    } catch (error) {
      console.error("Lỗi khi lấy userId:", error);
      return null;
    }
  }

  async loadChatHistory(friendId: string) {
    this.selectedFriendId = friendId;
    this.messages = []; // Clear current messages
    const token = this.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    try {
      const response = await this.http.get<any>(
        `http://localhost:8990/api/v1/chats/history/${this.userId}/${friendId}`, // Use template literals
        { headers }
      ).toPromise();
      this.messages = response.data; // Assign received chat history to the messages array
      console.log('Lịch sử tin nhắn đã tải:', this.messages);
    } catch (error) {
      console.error('Lỗi khi tải lịch sử tin nhắn:', error);
    }
  }

  async getFriendList() {
    const email = await this.getUserMailFromToken();
    if (!email) {
      console.error("Không tìm thấy email người dùng.");
      return;
    }
    const token = this.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    try {
      const response = await this.http.get<any>(`http://localhost:8010/api/v1/friends/get-list-friend-by-email/${email}`, { headers }).toPromise();
      this.friends = response.data;
      this.friends.forEach(friend => this.friendMap[friend.friendId] = friend.friendName);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách bạn bè:", error);
    }
  }

  async loadFriends() {
    await this.getFriendList();
  }

  sendMessage() {
    if (this.messageInput && this.selectedFriendId && this.userId) {
      const chatMessage: ChatMessage = {
        senderId: this.userId,
        senderName: this.email!,
        receiverId: this.selectedFriendId,
        content: this.messageInput,
        type: "CHAT"
      };
      this.stompClient.send("/app/chat.send", {}, JSON.stringify(chatMessage));
      this.messages.push(chatMessage); // Optimistically add to local messages
      this.messageInput = '';
    }
  }

  // async initChat() {
  //   const token = this.getToken();
  //   await this.getUserMailFromToken();
  //   if (!token || !this.userId) {
  //     console.error("Token hoặc userId không tồn tại!");
  //     return;
  //   }

  //   const socket = new SockJS(`http://localhost:8095/ws-chat?token=${token}`);
  //   this.stompClient = Stomp.over(socket);
  //   this.stompClient.connect({}, () => {
  //     console.log("Kết nối WebSocket thành công");

  //     const messageSubscription = this.stompClient.subscribe(`/user/queue/messages`, (message: any) => {
  //       const chatMessage: ChatMessage = JSON.parse(message.body);
  //       this.messages.push(chatMessage);
  //       console.log("Tin nhắn nhận được:", chatMessage);
  //     });

  //     console.log("Đã đăng ký các kênh WebSocket.");

  //   }, (error: any) => {
  //     console.error("Lỗi kết nối websocket: ", error);
  //   });
  // }

  async initChat() {
    const token = this.getToken();
    await this.getUserMailFromToken();
    if (!token || !this.userId) {
      console.error("Token hoặc userId không tồn tại!");
      return;
    }

    const socket = new SockJS(`http://localhost:8095/ws-chat?token=${token}`);
    this.stompClient = Stomp.over(socket);
    this.stompClient.connect({}, () => {
      console.log("Kết nối WebSocket thành công");

      this.stompClient.subscribe(`/user/queue/messages`, (message: any) => {
        const chatMessage: ChatMessage = JSON.parse(message.body);
        if(chatMessage.senderId !== this.userId){
          this.messages.push(chatMessage);
        }
        console.log("Tin nhắn nhận được:", chatMessage);
      });

      this.stompClient.subscribe(`/user/queue/webrtc/offer`, (message: any) => {
        const payload = JSON.parse(message.body);
        this.handleOffer(payload.offer, payload.callerId);
      });

      this.stompClient.subscribe(`/user/queue/webrtc/answer`, (message: any) => {
        const payload = JSON.parse(message.body);
        this.handleAnswer(payload.answer);
      });

      this.stompClient.subscribe(`/user/queue/webrtc/icecandidate`, (message: any) => {
        const payload = JSON.parse(message.body);
        this.handleIceCandidate(payload.iceCandidate);
      });

      this.stompClient.subscribe(`/user/queue/webrtc/reject`, (message: any) => {
        const payload = JSON.parse(message.body);
        alert(`${this.friendMap[payload.callerId] || payload.callerId} rejected the call.`);
        this.stopCall();
      });

      console.log("Đã đăng ký các kênh WebSocket.");

      socket.onclose = () => {
        console.log('WebSocket connection closed, attempting to reconnect...');
        setTimeout(() => this.initChat(), 5000);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    }, (error: any) => {
      console.error("Lỗi kết nối websocket: ", error);
    });
  }

  async startCall(friendId: string) {
    if (!this.isCalling && !this.isIncomingCall) {
      this.isCalling = true;
      this.callInProgressWith = friendId;
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }

        this.peerConnection = new RTCPeerConnection(this.iceServers);
        this.localStream.getTracks().forEach(track => this.peerConnection!.addTrack(track, this.localStream!));

        this.peerConnection.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
            if (this.remoteAudio) {
              this.remoteAudio.nativeElement.srcObject = this.remoteStream;
            }
          }
        };

        this.peerConnection.onicecandidate = async (event) => {
          if (event.candidate) {
            this.sendIceCandidate(friendId, event.candidate);
          }
        };

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.sendOffer(friendId, offer);

      } catch (error) {
        console.error("Lỗi khi khởi tạo cuộc gọi:", error);
        this.stopCall();
      }
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit, callerId: string) {
    if (!this.isCalling && !this.isIncomingCall) {
      this.isIncomingCall = true;
      this.incomingCallerId = callerId;
      this.incomingCallerName = this.friendMap[callerId] || callerId;
      this.incomingCallOffer = offer;
      this.ringtoneAudio?.play();
    }
  }

  async acceptCall() {
    if (this.isIncomingCall && this.incomingCallOffer && this.incomingCallerId) {
      this.isIncomingCall = false;
      this.isCalling = true;
      this.callInProgressWith = this.incomingCallerId;
      this.ringtoneAudio?.pause();
      this.ringtoneAudio!.currentTime = 0;

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }

        this.peerConnection = new RTCPeerConnection(this.iceServers);
        this.localStream.getTracks().forEach(track => this.peerConnection!.addTrack(track, this.localStream!));

        this.peerConnection.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
            if (this.remoteAudio) {
              this.remoteAudio.nativeElement.srcObject = this.remoteStream;
            }
          }
        };

        this.peerConnection.onicecandidate = async (event) => {
          if (event.candidate) {
            this.sendIceCandidate(this.incomingCallerId!, event.candidate);
          }
        };

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.incomingCallOffer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.sendAnswer(this.incomingCallerId, answer);

      } catch (error) {
        console.error("Lỗi khi chấp nhận cuộc gọi:", error);
        this.stopCall();
      }
    }
  }

  rejectCall() {
    if (this.isIncomingCall && this.incomingCallerId) {
      this.sendReject(this.incomingCallerId);
      this.stopRingtone();
      this.resetCallState();
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.isCalling && this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(iceCandidate: RTCIceCandidateInit) {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
      } catch (error) {
        console.error("Lỗi khi thêm ICE candidate:", error);
      }
    }
  }

  sendOffer(receiverId: string, offer: RTCSessionDescriptionInit) {
    const message: ChatMessage = {
      senderId: this.userId!,
      senderName: this.email!,
      receiverId: receiverId,
      content: JSON.stringify({ offer }),
      type: 'OFFER'
    };
    this.stompClient.send("/app/webrtc.offer", {}, JSON.stringify({ receiverId, offer }));
  }

  sendAnswer(receiverId: string, answer: RTCSessionDescriptionInit) {
    this.stompClient.send("/app/webrtc.answer", {}, JSON.stringify({ receiverId, answer }));
  }

  sendIceCandidate(receiverId: string, iceCandidate: RTCIceCandidate) {
    this.stompClient.send("/app/webrtc.icecandidate", {}, JSON.stringify({ receiverId, iceCandidate }));
  }

  sendReject(receiverId: string) {
    this.stompClient.send("/app/webrtc.reject", {}, JSON.stringify({ receiverId }));
  }

  stopCall() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.stopMediaStreams();
    this.resetCallState();
  }

  stopMediaStreams() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
  }

  resetCallState() {
    this.isCalling = false;
    this.callInProgressWith = null;
    this.isIncomingCall = false;
    this.incomingCallerId = null;
    this.incomingCallerName = null;
    this.incomingCallOffer = null;
    this.stopRingtone();
  }

  stopRingtone() {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
    }
  }
}