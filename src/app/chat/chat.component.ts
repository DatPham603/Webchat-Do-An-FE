import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import SockJS from 'sockjs-client';
import * as Stomp from 'stompjs';
import {
  HttpClient,
  HttpClientModule,
  HttpHeaders,
} from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import 'webrtc-adapter';
import { UUID } from 'node:crypto';

interface ChatMessage {
  senderId: string;
  senderName: string;
  receiverId: string;
  content: string;
  createdDate?: Date;
  type: 'CHAT' | 'OFFER' | 'ANSWER' | 'ICECANDIDATE' | 'REJECT' | 'GROUP_CHAT';
  fileUrl?: string; // Thêm trường cho URL file/image
  contentType?: 'TEXT' | 'IMAGE' | 'FILE';
}

interface ChatListItem {
  type: 'user' | 'group';
  id: string;
  name: string;
  email?: string; // Chỉ cho user
  avatar?: string; // Có thể cho cả user và group
  memberCount?: number; // Chỉ cho group
  lastMessage?: string;
  lastActive?: Date | string;
  unreadCount?: number;
}


@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy {
  stompClient: any;
  selectedFriendId: string | null = null;
  userId: string | null = null;
  email: string | null = null;
  friends: any[] = [];
  chatList: ChatListItem[] = [];
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
  isCreateGroupModalOpen: boolean = false;
  newGroupName: string = '';
  selectedGroupId: string | null = null;
  selectedGroupName: string | null = null;
  searchEmail: string = '';
  foundUser: any | null = null;
  findUserError: string | null = null;
  groupMembers: any[] = [];
  selectedFile: File | null = null;
  selectedImageUrl: string | null = null;

  @ViewChild('localVideo') localVideo: ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('remoteVideo') remoteVideo:
    | ElementRef<HTMLVideoElement>
    | undefined;
  @ViewChild('remoteAudio') remoteAudio:
    | ElementRef<HTMLAudioElement>
    | undefined;
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('imageInput') imageInput!: ElementRef;

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
    this.ringtoneAudio = new Audio(
      'assets/mixkit-marimba-waiting-ringtone-1360.wav'
    );
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


  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.uploadFile();
  }

  onImageSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.uploadImage();
  }

  async uploadFile() {
    if (this.selectedFile) {
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      const token = this.getToken();
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      try {
        const response: any = await this.http.post('http://localhost:8990/api/v1/file/upload-file', formData, { headers }).toPromise();
        this.selectedFile = null;
        this.sendMessage(response.url, 'FILE'); // Gọi sendMessage với URL và contentType
      } catch (error) {
        console.error('Lỗi tải lên file:', error);
        alert('Không thể tải lên file.');
      }
    }
  }

  async uploadImage() {
    if (this.selectedFile) {
      const formData = new FormData();
      formData.append('image', this.selectedFile);
      const token = this.getToken();
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      try {
        const response: any = await this.http.post('http://localhost:8990/api/v1/file/upload-image', formData, { headers }).toPromise();
        this.selectedFile = null;
        this.sendMessage(response.url, 'IMAGE'); 
      } catch (error) {
        console.error('Lỗi tải lên ảnh:', error);
        alert('Không thể tải lên ảnh.');
      }
    }
  }

  getFilenameFromUrl(url: string): string | null {
    if (!url) {
      return null;
    }
    const parts = url.split('/');
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
    return null;
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  async getUserMailFromToken() {
    const token = this.getToken();
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        this.email = payload.sub;

        if (this.email) {
          this.userId = await this.getUserId(this.email);
        } else {
          console.error('Email không được tìm thấy trong token.');
          return null;
        }
        return this.email; // Return email instead of payload.sub
      } catch (error) {
        console.error('Lỗi giải mã token:', error);
        return null;
      }
    }
    return null;
  }

  // group chat

  openCreateGroupModal() {
    this.isCreateGroupModalOpen = true;
  }

  closeCreateGroupModal() {
    this.isCreateGroupModalOpen = false;
    this.newGroupName = '';
    // Reset các trạng thái liên quan đến tạo nhóm nếu cần
  }

  async createGroup() {
    if (this.newGroupName.trim() && this.userId) {
      // Đảm bảo có userId
      const token = this.getToken();
      if (!token) {
        console.error('Không tìm thấy token đăng nhập.');
        alert('Bạn cần đăng nhập để tạo nhóm.');
        return;
      }

      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
      });
      const body = {
        name: this.newGroupName,
        ownerId: this.userId, // Gửi userId làm ownerId
        // memberIds: this.selectedInitialMembers.map(member => member.id)
        memberIds: [],
      };

      try {
        const response = await this.http
          .post<any>('http://localhost:8990/api/v1/groups/create-group', body, {
            headers,
          })
          .toPromise();
        console.log('Nhóm đã tạo:', response.data);
        this.closeCreateGroupModal();
        this.newGroupName = '';
        // this.selectedInitialMembers = [];
        this.selectGroup(response.data);
        // this.loadChatList();
      } catch (error: any) {
        console.error('Lỗi khi tạo nhóm:', error);
        if (error.error && error.error.message) {
          alert(`Lỗi tạo nhóm: ${error.error.message}`);
        } else {
          alert('Lỗi khi tạo nhóm. Vui lòng thử lại.');
        }
      }
    } else {
      alert('Vui lòng nhập tên nhóm.');
      if (!this.userId) {
        console.error('Không có userId. Đảm bảo bạn đã đăng nhập.');
      }
    }
  }

  selectGroup(group: any) {
    this.selectedFriendId = null; // Bỏ chọn bạn bè cá nhân
    this.selectedGroupId = group.id;
    this.selectedGroupName = group.name;
    this.messages = []; // Xóa tin nhắn cũ
    this.loadGroupChatHistory(group.id);
    this.subscribeToGroupTopic(group.id);
  }
  async loadGroupChatHistory(groupId: string) {
    this.selectedGroupId = groupId;
    this.messages = [];
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/room/history/${groupId}`, // Endpoint BE cho lịch sử chat nhóm
          { headers }
        )
        .toPromise();
      this.messages = response.data;
      console.log('Lịch sử chat nhóm đã tải:', this.messages);
      this.scrollToBottom();
    } catch (error) {
      console.error('Lỗi khi tải lịch sử chat nhóm:', error);
    }
  }

  subscribeToGroupTopic(groupId: string) {
    // if (this.stompClient && this.stompClient.connected) {
      this.stompClient.subscribe(`/topic/rooms/${groupId}`, (message: any) => {
        const chatMessage: ChatMessage = JSON.parse(message.body);
        if (chatMessage.senderId !== this.userId) {
          this.messages.push(chatMessage);
          this.scrollToBottom();
        }
        console.log('Tin nhắn nhóm nhận được:', chatMessage);
      });

      this.stompClient.subscribe(`/topic/groups/${groupId}`, (message: any) => {
        console.log('Thông báo nhóm:', message.body);
        // Xử lý thông báo nhóm (ví dụ: thành viên mới tham gia)
        this.loadGroupMembers(groupId); // Tải lại danh sách thành viên nhóm nếu cần
      });
    // }
  }

  async findUserByEmail() {
    if (this.searchEmail.trim() && this.selectedGroupId) {
      const token = this.getToken();
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
      });

      try {
        const response = await this.http
          .get<any>(
            `http://localhost:8990/api/v1/groups/${this.selectedGroupId}/find-user-by-email?email=${this.searchEmail}`,
            { headers }
          )
          .toPromise();
        this.foundUser = response.data;
        this.findUserError = null;
      } catch (error: any) {
        console.error('Lỗi khi tìm kiếm người dùng:', error);
        this.foundUser = null;
        this.findUserError = 'Không tìm thấy người dùng với email này.';
        if (error.status === 404) {
          this.findUserError = 'Không tìm thấy người dùng với email này.';
        } else {
          this.findUserError = 'Lỗi khi tìm kiếm người dùng.';
        }
      }
    } else if (!this.selectedGroupId) {
      alert('Vui lòng chọn một nhóm trước khi thêm người dùng.');
    } else {
      this.foundUser = null;
      this.findUserError = null;
    }
  }

  async addUserToGroup() {
    if (this.selectedGroupId && this.foundUser) {
      const token = this.getToken();
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      });
      const body = {
        email: this.foundUser.email,
        ownerId: this.userId
      };

      try {
        await this.http
          .post<any>(
            `http://localhost:8990/api/v1/groups/${this.selectedGroupId}/add-user`,
            body,
            { headers }
          )
          .toPromise();
        console.log('Đã thêm người dùng vào nhóm:', this.foundUser.email);
        this.foundUser = null;
        this.searchEmail = '';
        // Có thể tải lại danh sách thành viên nhóm hoặc hiển thị thông báo thành công
        this.loadGroupMembers(this.selectedGroupId);
      } catch (error) {
        console.error('Lỗi khi thêm người dùng vào nhóm:', error);
        // Xử lý lỗi
      }
    } else {
      alert('Vui lòng tìm kiếm người dùng trước khi thêm vào nhóm.');
    }
  }

  async loadGroupMembers(groupId: string) {
    // Gọi API BE để lấy danh sách thành viên của nhóm (nếu cần hiển thị)
    // const token = this.getToken();
    // const headers = new HttpHeaders({
    //   'Authorization': `Bearer ${token}`
    // });
    // try {
    //   const response = await this.http.get<any>(`http://localhost:8095/api/v1/groups/${groupId}/members`, { headers }).toPromise();
    //   this.groupMembers = response.data;
    //   console.log('Thành viên nhóm:', this.groupMembers);
    // } catch (error) {
    //   console.error('Lỗi khi tải thành viên nhóm:', error);
    // }
  }

  // auto cuộn xuống dưới khi có tin nhắn mới
  ngAfterViewInit() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop =
        this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  // Gọi hàm này mỗi khi có tin nhắn mới
  onNewMessage(): void {
    // Thêm message vào danh sách
    this.scrollToBottom();
  }
  //

  // selectFriend(friend: any) {
  //   this.selectedFriendId = friend.friendId;
  //   this.selectedFriend = friend;
  //   this.loadChatHistory(friend.friendId);
  // }

  selectChat(item: ChatListItem) {
    if (item.type === 'user') {
      this.selectedGroupId = null;
      this.selectedGroupName = null;
      this.selectedFriendId = item.id;
      this.selectedFriend = { friendId: item.id, friendName: item.name, avatar: item.avatar }; // Tạo một object tương tự như 'friend' cũ
      this.loadChatHistory(item.id);
    } else if (item.type === 'group') {
      this.selectedFriendId = null;
        this.selectedFriend = null;
        this.selectedGroupId = item.id;
        this.selectedGroupName = item.name;
        this.messages = [];
        this.loadGroupChatHistory(item.id);
        // Di chuyển logic subscribe vào đây, đảm bảo stompClient đã kết nối
        if (this.stompClient && this.stompClient.connected) {
            this.stompClient.subscribe(`/topic/rooms/${this.selectedGroupId}`, (message: any) => {
                const chatMessage: ChatMessage = JSON.parse(message.body);
                if (chatMessage.senderId !== this.userId) {
                    this.messages.push(chatMessage);
                    this.scrollToBottom();
                }
                console.log('Tin nhắn nhóm nhận được:', chatMessage);
            });
        } else {
            console.error('Stomp client không hoạt động khi chọn nhóm.');
        }
    }
  }
  

  async getUserId(email: string) {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(`http://localhost:8989/api/v1/users/find-by-email/${email}`, {
          headers,
        })
        .toPromise();
      return response.data.id;
    } catch (error) {
      console.error('Lỗi khi lấy userId:', error);
      return null;
    }
  }

  async loadChatHistory(friendId: string) {
    this.selectedFriendId = friendId;
    this.messages = []; // Clear current messages
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/history/${this.userId}/${friendId}`, // Use template literals
          { headers }
        )
        .toPromise();
      this.messages = response.data; // Assign received chat history to the messages array
      console.log('Lịch sử tin nhắn đã tải:', this.messages);
    } catch (error) {
      console.error('Lỗi khi tải lịch sử tin nhắn:', error);
    }
  }

  // async getFriendList() {
  //   const email = await this.getUserMailFromToken();
  //   if (!email) {
  //     console.error('Không tìm thấy email người dùng.');
  //     return;
  //   }
  //   const token = this.getToken();
  //   const headers = new HttpHeaders({
  //     Authorization: `Bearer ${token}`,
  //   });

  //   try {
  //     const response = await this.http
  //       .get<any>(
  //         `http://localhost:8010/api/v1/friends/get-list-friend-by-email/${email}`,
  //         { headers }
  //       )
  //       .toPromise();
  //     this.friends = response.data;
  //     this.friends.forEach(
  //       (friend) => (this.friendMap[friend.friendId] = friend.friendName)
  //     );
  //   } catch (error) {
  //     console.error('Lỗi khi lấy danh sách bạn bè:', error);
  //   }
  // }

  async loadFriends() {
    const token = this.getToken();
    const userId = this.userId; // Hàm lấy userId ở frontend
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  
    try {
      const response = await this.http
        .get<any>(`http://localhost:8990/api/v1/chats/list?userId=${userId}`, { headers })
        .toPromise();
      this.chatList = response.data;
      this.chatList.forEach(
        (friend) => (this.friendMap[friend.id] = friend.name)
      );
      console.log('Danh sách chat đã tải:', this.chatList);
    } catch (error) {
      console.error('Lỗi khi tải danh sách chat:', error);
    }
  }
  
  // Giả sử bạn có một hàm để lấy userId ở frontend
  getLoggedInUserId(): string | null {
    // Logic để lấy userId từ local storage, state, v.v.
    return localStorage.getItem('userId'); // Ví dụ
  }

  sendMessage(fileUrl: string | null = null, contentType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT') {
    if ((this.messageInput || fileUrl) && this.userId) {
      let receiverId: string;
      let messageType: 'CHAT' | 'GROUP_CHAT';

      if (this.selectedGroupId) {
        receiverId = this.selectedGroupId;
        messageType = 'GROUP_CHAT';
      } else if (this.selectedFriendId) {
        receiverId = this.selectedFriendId;
        messageType = 'CHAT';
      } else {
        return; // Không có người nhận được chọn
      }

      const chatMessage: ChatMessage = {
        senderId: this.userId,
        senderName: this.email!,
        receiverId: receiverId,
        content: contentType === 'TEXT' ? this.messageInput : '',
        type: messageType,
        fileUrl: fileUrl!,
        contentType: contentType,
      };

      let destination = '';
      if (this.selectedGroupId) {
        destination = `/app/chat.send.room/${this.selectedGroupId}`;
      } else if (this.selectedFriendId) {
        destination = '/app/chat.send';
      }

      this.stompClient.send(
        destination,
        {},
        JSON.stringify(chatMessage)
      );

      this.messages.push(chatMessage);
      this.messageInput = '';
      this.selectedFile = null; // Reset selected file
      this.selectedImageUrl = null; // Reset selected image URL
      this.fileInput.nativeElement.value = ''; // Reset file input
      this.imageInput.nativeElement.value = ''; // Reset image input
    }
  }

  async initChat() {
    const token = this.getToken();
    await this.getUserMailFromToken();
    if (!token || !this.userId) {
      console.error('Token hoặc userId không tồn tại!');
      return;
    }

    const socket = new SockJS(`http://localhost:8095/ws-chat?token=${token}`);
    this.stompClient = Stomp.over(socket);
    this.stompClient.connect(
      {},
      () => {
        console.log('Kết nối WebSocket thành công');

        this.stompClient.subscribe(`/user/queue/messages`, (message: any) => {
          const chatMessage: ChatMessage = JSON.parse(message.body);
          if (
            chatMessage.senderId !== this.userId &&
            chatMessage.receiverId === this.userId
          ) {
            // Chỉ hiển thị tin nhắn 1-1 cho người nhận
            this.messages.push(chatMessage);
            this.scrollToBottom();
          }
          console.log('Tin nhắn cá nhân nhận được:', chatMessage);
        });

        this.stompClient.subscribe(
          `/user/queue/webrtc/offer`,
          (message: any) => {
            const payload = JSON.parse(message.body);
            this.handleOffer(payload.offer, payload.callerId);
          }
        );

        this.stompClient.subscribe(
          `/user/queue/webrtc/answer`,
          (message: any) => {
            const payload = JSON.parse(message.body);
            this.handleAnswer(payload.answer);
          }
        );

        this.stompClient.subscribe(
          `/user/queue/webrtc/icecandidate`,
          (message: any) => {
            const payload = JSON.parse(message.body);
            this.handleIceCandidate(payload.iceCandidate);
          }
        );

        this.stompClient.subscribe(
          `/user/queue/webrtc/reject`,
          (message: any) => {
            const payload = JSON.parse(message.body);
            alert(
              `${
                this.friendMap[payload.callerId] || payload.callerId
              } rejected the call.`
            );
            this.stopCall();
          }
        );

        console.log('Đã đăng ký các kênh WebSocket.');

        socket.onclose = () => {
          console.log(
            'WebSocket connection closed, attempting to reconnect...'
          );
          setTimeout(() => this.initChat(), 5000);
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      },
      (error: any) => {
        console.error('Lỗi kết nối websocket: ', error);
      }
    );
  }

  // call (các hàm xử lý cuộc gọi)
  async startCall(friendId: string) {
    if (!this.isCalling && !this.isIncomingCall) {
      this.isCalling = true;
      this.callInProgressWith = friendId;
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }

        this.peerConnection = new RTCPeerConnection(this.iceServers);
        this.localStream
          .getTracks()
          .forEach((track) =>
            this.peerConnection!.addTrack(track, this.localStream!)
          );

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
        console.error('Lỗi khi khởi tạo cuộc gọi:', error);
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
    if (
      this.isIncomingCall &&
      this.incomingCallOffer &&
      this.incomingCallerId
    ) {
      this.isIncomingCall = false;
      this.isCalling = true;
      this.callInProgressWith = this.incomingCallerId;
      this.ringtoneAudio?.pause();
      this.ringtoneAudio!.currentTime = 0;

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }

        this.peerConnection = new RTCPeerConnection(this.iceServers);
        this.localStream
          .getTracks()
          .forEach((track) =>
            this.peerConnection!.addTrack(track, this.localStream!)
          );

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

        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(this.incomingCallOffer)
        );
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.sendAnswer(this.incomingCallerId, answer);
      } catch (error) {
        console.error('Lỗi khi chấp nhận cuộc gọi:', error);
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
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    }
  }

  async handleIceCandidate(iceCandidate: RTCIceCandidateInit) {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(iceCandidate)
        );
      } catch (error) {
        console.error('Lỗi khi thêm ICE candidate:', error);
      }
    }
  }

  sendOffer(receiverId: string, offer: RTCSessionDescriptionInit) {
    const message: ChatMessage = {
      senderId: this.userId!,
      senderName: this.email!,
      receiverId: receiverId,
      content: JSON.stringify({ offer }),
      type: 'OFFER',
    };
    this.stompClient.send(
      '/app/webrtc.offer',
      {},
      JSON.stringify({ receiverId, offer })
    );
  }

  sendAnswer(receiverId: string, answer: RTCSessionDescriptionInit) {
    this.stompClient.send(
      '/app/webrtc.answer',
      {},
      JSON.stringify({ receiverId, answer })
    );
  }

  sendIceCandidate(receiverId: string, iceCandidate: RTCIceCandidate) {
    this.stompClient.send(
      '/app/webrtc.icecandidate',
      {},
      JSON.stringify({ receiverId, iceCandidate })
    );
  }

  sendReject(receiverId: string) {
    this.stompClient.send(
      '/app/webrtc.reject',
      {},
      JSON.stringify({ receiverId })
    );
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
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
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
