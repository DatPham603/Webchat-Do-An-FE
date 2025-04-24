import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import SockJS from 'sockjs-client';
import * as Stomp from 'stompjs';
import {
  HttpClient,
  HttpClientModule,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import 'webrtc-adapter';
import { ChatListItem, ChatMessage, UserDTO } from '../model/dto.model';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { AvatarService } from '../service/avatar.service';
import { RouterModule } from '@angular/router';
import { FriendProfileComponent } from './friendProfile/friend-profile.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, RouterModule, FriendProfileComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  providers: [AvatarService],
})
export class ChatComponent implements OnInit, OnDestroy {
  stompClient: any;
  selectedFriendId: string | null = null;
  userId: string | null = null;
  email: string | null = null;
  friends: any[] = [];
  chatList: (ChatListItem & { avatarUrl?: SafeUrl | string })[] = [];
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
  groupAvatarUrl: string | null = null;
  isEditingGroupAvatar: boolean = false;
  groupAvatarFile: File | null = null;
  searchEmail: string = '';
  searchTerm: string = '';
  foundUser: any | null = null;
  foundUserToAdd: any | null = null;
  findUserError: string | null = null;
  groupMembers: any[] = [];
  selectedFile: File | null = null;
  selectedImageUrl: string | null = null;
  selectedAvatar: File | null = null;
  avatarUrl: SafeUrl | null = null;
  user: UserDTO = {};
  selectedFriendAvatarUrl: SafeUrl | string | null = null;
  isGroupMembersVisible: boolean = false;
  isAddMemberModalOpen: boolean = false;
  potentialGroupMembers: any[] = [];
  isFriendInfoModalOpen: boolean = false;
  selectedGroupFriendId: string | null = null;
  imageList: any[] = [];
  docList: any[] = [];
  showMediaSection: boolean = false;
  showDocsSection: boolean = false;
  zoomedImageUrl: string | null = null;

  @ViewChild('localVideo') localVideo: ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('remoteVideo') remoteVideo: | ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('remoteAudio') remoteAudio: | ElementRef<HTMLAudioElement> | undefined;
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('imageInput') imageInput!: ElementRef;
  // @ViewChild('groupAvatarInput') groupAvatarInput!: ElementRef;
  @ViewChild('groupAvatarInputRef') groupAvatarInputRef!: ElementRef;


  private readonly iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Add more STUN/TURN servers as needed
    ],
  };

  constructor(private http: HttpClient,
    private avatarService: AvatarService,
    private sanitizer: DomSanitizer,
  ) { }

  async ngOnInit() {
    await this.initChat(); // Call initChat to establish the connection and subscribe
    await this.loadFriends();
    this.fetchUserDataAsync();
    setTimeout(() => this.scrollToBottom(), 0);
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

  openFriendInfoModal(friendId: string): void {
    this.selectedGroupFriendId = friendId;
    this.isFriendInfoModalOpen = true;
  }

  closeFriendInfoModal(): void {
    this.isFriendInfoModalOpen = false;
    this.selectedGroupFriendId = null;
  }

  handleShowFriend(friendId: string): void {
    this.openFriendInfoModal(friendId);
  }

  async fetchUserDataAsync(): Promise<void> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http.get<any>(`http://localhost:8989/api/v1/users/${this.userId}`, {
        headers,
      })
        .toPromise();
      console.log('Response:', response); // Log response to console
      if (response?.data) {
        this.user = { ...response.data };
        if (this.user?.avatar) {
          this.loadAvatarImage(this.user.avatar);
        }
      } else {
        console.error('Không tìm thấy thông tin người dùng hoặc dữ liệu trả về không hợp lệ.');
        // Xử lý trường hợp không có dữ liệu (ví dụ: hiển thị thông báo lỗi cho người dùng)
      }
    } catch (error) {
      console.error('Lỗi khi tải thông tin người dùng:', error);
    }
  }

  loadAvatarImage(filename: string): void {
    const imageUrl = this.getFilenameFromUrl(filename)
    this.avatarService.getAvatarImage(imageUrl!)
      .subscribe(
        (blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            this.avatarUrl = this.sanitizer.bypassSecurityTrustUrl(reader.result as string);
          };
          reader.readAsDataURL(blob);
        },
        (error) => {
          console.error('Lỗi khi tải ảnh avatar:', error);
          // Có thể hiển thị ảnh placeholder nếu tải lỗi
        }
      );
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

  async loadImages(friendId: string) {
    this.selectedFriendId = friendId;
    this.messages = [];
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/history/list-image/${this.userId}/${friendId}`, // Use template literals
          { headers }
        )
        .toPromise();
      this.imageList = response.data;
      console.log('Lịch sử ảnh đã tải:', this.imageList);
      console.log(this.userId, friendId)
    } catch (error) {
      console.error('Lỗi khi tải lịch sử tin nhắn:', error);
    }
  }

  async loadImageGroupChatHistory(groupId: string) {
    this.selectedGroupId = groupId;
    this.messages = [];
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/room/list-image/history/${groupId}`,// Endpoint BE cho lịch sử chat nhóm
          { headers }
        )
        .toPromise();
      this.imageList = response.data;
    } catch (error) {
      console.error('Lỗi khi tải lịch sử chat nhóm:', error);
    }
  }

  showMedia(): void {
    this.showMediaSection = !this.showMediaSection;
    this.showDocsSection = false;
    if (this.imageList.length > 0) {
      this.showMediaSection = true;
    }
  }

  zoomImage(imageUrl: string): void {
    this.zoomedImageUrl = imageUrl;
    document.body.classList.add('disable-scroll'); // Ngăn cuộn trang khi ảnh phóng to
  }

  closeZoom(): void {
    this.zoomedImageUrl = null;
    document.body.classList.remove('disable-scroll'); // Cho phép cuộn trang lại
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent): void {
    this.closeZoom();
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

  onAvatarSelected(event: any): void {
    this.groupAvatarFile = event.target.files[0];
  }

  clearAvatarSelection(): void {
    this.isEditingGroupAvatar = false;
    this.groupAvatarFile = null;
  }

  async uploadGroupAvatar(): Promise<any> {
    console.log(this.selectedGroupId)
    if (this.groupAvatarFile && this.selectedGroupId) {
      const formData = new FormData();
      formData.append('image', this.groupAvatarFile);
      formData.append('groupId', this.selectedGroupId); 
      try {
        const response = await this.http
          .post<any>(`http://localhost:8990/api/v1/groups/upload-group-avatar`, formData)
          .toPromise();
          console.log(response)
          this.loadGroupAvatarImage(response.url)
          this.isEditingGroupAvatar = false;
          alert('Avatar uploaded successfully:');
        return response; 
      } catch (error) {
        console.error('Error uploading group avatar:', error);
        throw error; // Re-throw lỗi để component xử lý
      }
    } else {
      console.warn('No image or groupId provided for upload.');
      return null;
    }
  }

  async loadGroupAvatarImage(filename: string) {
    try {
        this.groupAvatarUrl = `http://localhost:8990/api/v1/groups/get-group-avatar/${this.getFilenameFromUrl(filename)}`;
      } catch (error) {
      console.error('Lỗi khi tải avatar nhóm:', error);
    }
  }

  async loadGroupAvatarImage2(filename: string): Promise<string | SafeUrl> {
    try {
      const imageUrl = `http://localhost:8990/api/v1/groups/get-group-avatar/${this.getFilenameFromUrl(filename)}`;
      return imageUrl;
    } catch (error) {
      console.error('Lỗi khi tải avatar nhóm:', error);
      return 'path/to/default/group-avatar.png'; // Trả về URL mặc định khi có lỗi
    }
  }

  async loadFile(friendId: string) {
    this.selectedFriendId = friendId;
    this.messages = [];
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/history/list-file/${this.userId}/${friendId}`, 
          { headers }
        )
        .toPromise();
      this.docList = response.data;
      console.log("danh sach file:" + this.docList)
    } catch (error) {
      console.error('Lỗi khi tải lịch sử tin nhắn:', error);
    }
  }

  async loadFileGroupChatHistory(groupId: string) {
    this.selectedGroupId = groupId;
    this.messages = [];
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(
          `http://localhost:8990/api/v1/chats/room/list-file/history/${groupId}`,
          { headers }
        )
        .toPromise();
        this.docList = response.data;
    } catch (error) {
      console.error('Lỗi khi tải lịch sử chat nhóm:', error);
    }
  }

  showDocs(): void {
    this.showMediaSection = false;
    this.showDocsSection = true; 
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

  openAddMemberModal() {
    this.isAddMemberModalOpen = true;
    this.potentialGroupMembers = []; // Clear previous list
    this.loadFriendsForGroup();
    // Có thể tải danh sách người dùng tiềm năng ở đây nếu cần,
    // hoặc bạn có thể sử dụng lại kết quả tìm kiếm 'foundUser'
    // và cho phép thêm nhiều người cùng lúc.
  }

  closeAddMemberModal() {
    this.isAddMemberModalOpen = false;
    this.foundUser = null;
    this.searchEmail = '';
    this.findUserError = null;
  }

  selectGroup(group: any) {
    this.selectedFriendId = null; // Bỏ chọn bạn bè cá nhân
    this.selectedGroupId = group.id;
    this.selectedGroupName = group.name;
    this.messages = []; // Xóa tin nhắn cũ
    this.loadGroupMembers(group.id)
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
      setTimeout(() => this.scrollToBottom(), 0);
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
        setTimeout(() => this.scrollToBottom(), 0);
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

  async findUserByEmailOrPhoneNumber() {
    if (this.searchTerm.trim()) {
      const token = this.getToken();
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
      });

      try {
        const response = await this.http
          .get<any>(
            `http://localhost:8989/api/v1/users/auto-complete?searchTerm=${this.searchTerm}`,
            { headers }
          )
          .toPromise();
        this.foundUserToAdd = response.data;
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
  
  async loadFriendsForGroup() {

    const token = this.getToken();
    const userId = this.userId;
    if (!token || !userId) {
      console.error('Token hoặc userId không tồn tại.');
      return;
    }
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http
        .get<any>(`http://localhost:8010/api/v1/friends/get-list-friend/${userId}`, { headers })
        .toPromise();
      this.potentialGroupMembers = response.data;
      console.log('Danh sách bạn bè đã tải cho nhóm:', this.potentialGroupMembers);
    } catch (error) {
      console.error('Lỗi khi tải danh sách bạn bè:', error);
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
        let errorMessage = 'Đã có lỗi xảy ra khi thêm người dùng vào nhóm.';
        if (error instanceof HttpErrorResponse) {
          if (error.error && error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else {
            errorMessage = `Lỗi từ server: ${error.status} - ${error.statusText}`;
          }
        }
        alert(errorMessage);
      }
    } else {
      alert('Vui lòng tìm kiếm người dùng trước khi thêm vào nhóm.');
    }
  }

  async addUserToGroupFromFriend(friendEmail: any) {
    console.log(this.selectedGroupId + friendEmail)
    if (this.selectedGroupId && friendEmail) {
      const token = this.getToken();
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      });
      // Giả sử API backend chấp nhận userId để thêm
      const body = {
        email: friendEmail,
        ownerId: this.userId
      };

      try {
        await this.http
          .post<any>(
            `http://localhost:8990/api/v1/groups/${this.selectedGroupId}/add-user`, // Endpoint có thể khác
            body,
            { headers }
          )
          .toPromise();
        alert('Đã thêm bạn bè vào nhóm:' + friendEmail);
        this.loadGroupMembers(this.selectedGroupId); // Tải lại danh sách thành viên
        // Có thể hiển thị thông báo thành công
      } catch (error) {
        let errorMessage = 'Đã có lỗi xảy ra khi thêm người dùng vào nhóm.';
        if (error instanceof HttpErrorResponse) {
          if (error.error && error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else {
            errorMessage = `Lỗi từ server: ${error.status} - ${error.statusText}`;
          }
        }
        alert(errorMessage);
      }
    } else {
      alert('Vui lòng chọn một nhóm trước khi thêm bạn bè.');
    }
  }

  async loadGroupMembers(groupId: string) {
    const token = this.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    try {
      const response = await this.http.get<any>(`http://localhost:8990/api/v1/groups/get-group-users/${groupId}`, { headers }).toPromise();
      this.groupMembers = response.data;
      console.log('Thành viên nhóm:', this.groupMembers);
    } catch (error) {
      console.error('Lỗi khi tải thành viên nhóm:', error);
    }
  }

  // auto cuộn xuống dưới khi có tin nhắn mới

  scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Lỗi khi cuộn:', err);
    }
  }

  // Gọi hàm này mỗi khi có tin nhắn mới
  onNewMessage(): void {
    // Thêm message vào danh sách
    setTimeout(() => this.scrollToBottom(), 0);
  }



  selectChat(item: ChatListItem) {
    if (item.type === 'user') {
      this.selectedGroupId = null;
      this.selectedGroupName = null;
      this.selectedFriendId = item.id;
      this.selectedFriend = { friendId: item.id, friendName: item.name, avatar: item.avatar }; // Tạo một object tương tự như 'friend' cũ
      this.selectedFriendAvatarUrl = null; // Reset previous avatar URL
      setTimeout(() => this.scrollToBottom(), 0);
      if (this.selectedFriend.avatar) {
        this.loadSelectedFriendAvatar(this.selectedFriend.avatar);
      } else {
        this.selectedFriendAvatarUrl = 'path/to/default/avatar.png';
      }
      this.loadChatHistory(item.id);
      this.loadImages(item.id);
      this.showMediaSection = true;
      this.loadFile(item.id);
      this.showDocsSection = false;
    } else if (item.type === 'group') {
      this.selectedFriendId = null;
      this.selectedFriend = null;
      this.selectedGroupId = item.id;
      this.selectedGroupName = item.name;
      this.selectedFriendAvatarUrl = null;
      this.messages = [];
      this.loadGroupAvatarImage(item.avatar!)
      this.loadGroupChatHistory(item.id);
      setTimeout(() => this.scrollToBottom(), 0);
      this.loadGroupMembers(item.id)
      console.log(item.id)
      this.loadImageGroupChatHistory(item.id)
      this.showMediaSection = true;
      this.loadFileGroupChatHistory(item.id);
      this.showDocsSection = false;      
      // Di chuyển logic subscribe vào đây, đảm bảo stompClient đã kết nối
      if (this.stompClient && this.stompClient.connected) {
        this.stompClient.subscribe(`/topic/rooms/${this.selectedGroupId}`, (message: any) => {
          const chatMessage: ChatMessage = JSON.parse(message.body);
          if (chatMessage.senderId !== this.userId) {
            this.messages.push(chatMessage);
            this.updateChatListItem(chatMessage);
          }
          console.log('Tin nhắn nhóm nhận được:', chatMessage);
        });
      } else {
        console.error('Stomp client không hoạt động khi chọn nhóm.');
      }
    }
  }

  async loadSelectedFriendAvatar(filename: string) {
    try {
      const blob = await this.avatarService.getAvatarImage(this.getFilenameFromUrl(filename)!).toPromise();
      if (blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
          this.selectedFriendAvatarUrl = this.sanitizer.bypassSecurityTrustUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } else {
        this.selectedFriendAvatarUrl = 'path/to/default/avatar.png';
      }
    } catch (error) {
      console.error('Lỗi khi tải avatar của bạn bè:', error);
      this.selectedFriendAvatarUrl = 'path/to/default/avatar.png';
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
      setTimeout(() => this.scrollToBottom(), 0);
      console.log('Lịch sử tin nhắn đã tải:', this.messages);
    } catch (error) {
      console.error('Lỗi khi tải lịch sử tin nhắn:', error);
    }
  }

  async loadFriends() {
    const token = this.getToken();
    const userId = this.userId;
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    try {
      const response = await this.http
        .get<any>(`http://localhost:8990/api/v1/chats/list?userId=${userId}`, { headers })
        .toPromise();

      this.chatList = await Promise.all(response.data.map(async (item: ChatListItem & { avatarUrl?: SafeUrl | string }) => {
        if (item.avatar) {
          if (item.type === 'user') {
            try {
              const blob = await this.avatarService.getAvatarImage(this.getFilenameFromUrl(item.avatar)!).toPromise();
              if (blob) {
                const reader = new FileReader();
                return new Promise<ChatListItem & { avatarUrl?: SafeUrl | string }>((resolve) => {
                  reader.onloadend = () => {
                    resolve({ ...item, avatarUrl: this.sanitizer.bypassSecurityTrustUrl(reader.result as string) });
                  };
                  reader.readAsDataURL(blob);
                });
              } else {
                console.warn('Không nhận được blob dữ liệu avatar:', item.avatar);
                return { ...item, avatarUrl: 'path/to/default/avatar.png' };
              }
            } catch (error) {
              console.error('Lỗi khi tải avatar:', error);
              return { ...item, avatarUrl: 'path/to/default/avatar.png' };
            }
          } else if (item.type === 'group') {
            // return { ...item, avatarUrl: this.loadGroupAvatarImage(item.avatar) }; 
            return { ...item, avatarUrl: await this.loadGroupAvatarImage2(item.avatar) };
          } else {
            // Xử lý trường hợp item.type không phải 'user' hoặc 'group' nhưng có avatar
            console.warn(`Loại chat không xác định (${item.type}) nhưng có avatar:`, item.avatar);
            return { ...item, avatarUrl: 'path/to/default/avatar.png' }; // Hoặc một logic xử lý khác
          }
        } else {
          return { ...item, avatarUrl: 'path/to/default/avatar.png' };
        }
      }));

      this.chatList.forEach(
        (friend) => (this.friendMap[friend.id] = friend.name)
      );
      console.log('Danh sách chat đã tải:', this.chatList);
    } catch (error) {
      console.error('Lỗi khi tải danh sách chat:', error);
    }
  }

  getAvatarUrlForChatListItem(filename: string): string {
    return `http://localhost:8989/api/v1/users/avatar/get-avatar/${this.getFilenameFromUrl(filename)}`;
  }



  // Giả sử bạn có một hàm để lấy userId ở frontend
  getLoggedInUserId(): string | null {
    // Logic để lấy userId từ local storage, state, v.v.
    return localStorage.getItem('userId'); // Ví dụ
  }

  updateMediaAndDocs() {
    this.imageList = this.messages.filter(
      (msg) => msg.contentType === 'IMAGE' && msg.fileUrl
    );
    this.docList = this.messages.filter(
      (msg) => msg.contentType === 'FILE' && msg.fileUrl
    );
  }

  sendMessage(fileUrl: string | null = null, contentType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT') {
    if ((this.messageInput || fileUrl) && this.userId) {
      let receiverId: string;
      let messageType: 'CHAT' | 'GROUP_CHAT';

      if (this.selectedGroupId) {
        receiverId = this.selectedGroupId;
        messageType = 'GROUP_CHAT';
        this.onNewMessage()
      } else if (this.selectedFriendId) {
        receiverId = this.selectedFriendId;
        messageType = 'CHAT';
        this.onNewMessage()
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
      this.updateMediaAndDocs();
      this.updateChatListItem(chatMessage);
      this.messageInput = '';
      this.selectedFile = null;
      this.selectedImageUrl = null;
      this.fileInput.nativeElement.value = '';
      this.imageInput.nativeElement.value = '';
    }
  }

  updateChatListItem(newMessage: ChatMessage) {
    const receiverOrGroupId = newMessage.type === 'CHAT' ?
      newMessage.senderId === this.userId ? newMessage.receiverId : newMessage.senderId :
      newMessage.receiverId; // groupId cho tin nhắn nhóm

    const index = this.chatList.findIndex(item => item.id === receiverOrGroupId);
    if (index !== -1) {
      this.chatList[index] = { ...this.chatList[index], lastMessage: newMessage.content };
      const updatedItem = this.chatList.splice(index, 1)[0];
      this.chatList.unshift(updatedItem);
    } else {
      console.warn('Không tìm thấy item trong chatList để cập nhật:', newMessage);
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
            this.updateChatListItem(chatMessage);
            setTimeout(() => this.scrollToBottom(), 0);
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
              `${this.friendMap[payload.callerId] || payload.callerId
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
