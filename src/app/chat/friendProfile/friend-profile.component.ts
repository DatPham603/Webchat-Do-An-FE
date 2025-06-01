import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgIf, NgClass, CommonModule } from '@angular/common';
import { AvatarService } from '../../service/avatar.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UserDTO } from '../../model/dto.model';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'friend-infor',
  standalone: true,
  imports: [FormsModule, HttpClientModule, NgIf, NgClass, CommonModule],
  templateUrl: './friend-profile.component.html',
  styleUrls: ['./friend-profile.component.scss'],
  providers: [AvatarService],
})
export class FriendProfileComponent implements OnInit, OnDestroy {
  @Input() userId: string | null = null;
  @Output() closeModal: EventEmitter<void> = new EventEmitter<void>();
  user: UserDTO = {};
  email: string | null = null;
  selectedAvatar: File | null = null;
  avatarUrl: SafeUrl | null = null;
  isLoadingFriendshipStatus: boolean = true;
  isFriend: boolean = false;
  currentUserId: string | null = null;
  defaultAvatarUrl: string = 'assets/avatar-default-icon-2048x2048-h6w375ur.png';
  isRequestSent: boolean = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private avatarService: AvatarService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute // Inject ActivatedRoute
  ) { }


  async ngOnInit(): Promise<void> {
    await this.getUserMailFromToken();
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const idFromRoute = params.get('id');
      if (idFromRoute) {
        this.userId = idFromRoute;
        this.checkFriendshipStatus(this.currentUserId, this.userId);
        this.fetchFriendDataAsync(this.userId);
      } else if (this.userId) {
        this.checkFriendshipStatus(this.currentUserId, this.userId);
        this.fetchFriendDataAsync(this.userId);
      } else {
        console.error('Không có ID người bạn.');
      }
    });
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  async getUserMailFromToken() {
    const token = this.getToken();
    console.log(token)
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        this.email = payload.sub;

        if (this.email) {
          this.currentUserId = await this.getCurrentUserId(this.email);
          console.log("thng tin nguoi dung hien tai:" + this.currentUserId)
        } else {
          console.error('Email không được tìm thấy trong token.');
          return null;
        }
        return this.email;
      } catch (error) {
        console.error('Lỗi giải mã token:', error);
        return null;
      }
    }
    return null;
  }

  async getCurrentUserId(email: string) {
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

  async fetchFriendDataAsync(friendId: string): Promise<void> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http.get<any>(`http://localhost:8989/api/v1/users/${friendId}`, {
        headers,
      })
        .toPromise();
      console.log('Friend Data Response:', response);
      if (response?.data) {
        this.user = { ...response.data };
        if (this.user?.avatar) {
          this.loadAvatarImage(this.user.avatar);
        }
      } else {
        console.error('Không tìm thấy thông tin người bạn hoặc dữ liệu trả về không hợp lệ.');
        // Xử lý trường hợp không có dữ liệu
      }
    } catch (error) {
      console.error('Lỗi khi tải thông tin người bạn:', error);
      // Xử lý lỗi
    }
  }

  // async checkFriendshipStatus(currentUserId: any, friendId: any): Promise<void> {
  //   const token = this.getToken();
  //   const headers = new HttpHeaders({
  //     Authorization: `Bearer ${token}`,
  //   });
  //   try {
  //     const response = await this.http.get<any>(`http://localhost:8010/api/v1/friends/check?userId=${currentUserId}&friendId=${friendId}`, { headers, })
  //       .toPromise();
  //     this.isFriend = response.data;
  //     console.log("bạn bè " + this.isFriend)
  //   } catch (error) {
  //     console.error('Lỗi khi kiểm tra trạng thái bạn bè:', error);
  //     this.isFriend = false;
  //   }
  // }

  async checkFriendshipStatus(currentUserId: any, friendId: any): Promise<void> {
  this.isLoadingFriendshipStatus = true; // Bắt đầu tải
  const token = this.getToken();
  const headers = new HttpHeaders({
    Authorization: `Bearer ${token}`,
  });
  try {
    const response = await this.http.get<any>(`http://localhost:8010/api/v1/friends/check?userId=${currentUserId}&friendId=${friendId}`, { headers, })
      .toPromise();
    this.isFriend = response.data;
    console.log("bạn bè " + this.isFriend);
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái bạn bè:', error);
    this.isFriend = false;
  } finally {
    this.isLoadingFriendshipStatus = false; // Kết thúc tải (dù thành công hay thất bại)
  }
}

  async addFriend(currentUserId: any, friendId: any): Promise<void> {
    const token = this.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    try {
      const response = await this.http.post<any>(`http://localhost:8010/api/v1/friends/send-request?userId=${currentUserId}&friendId=${friendId}`, {}, { headers, })
        .toPromise();
      this.isRequestSent = true;
      alert("Gửi yêu cầu kết bạn thành công !");
    } catch (error: any) { // Type 'error' as 'any' or 'HttpErrorResponse'
      console.error('Lỗi khi gửi yêu cầu kết bạn:', error);
      this.isFriend = false;
      let errorMessage = 'Đã xảy ra lỗi khi gửi yêu cầu kết bạn.';
      if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (error.message) {
        errorMessage = error.message; // Fallback to Angular's error message
      }
      alert(`${errorMessage}`);
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
    return 'Lỗi khi tải ảnh';
  }

  loadAvatarImage(filename: string): void {
    const imageUrl = this.getFilenameFromUrl(filename);
    this.avatarService.getAvatarImage(imageUrl!)
      .pipe(takeUntil(this.destroy$))
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
          // Xử lý lỗi
        }
      );
  }

  closeFriendInfo(): void {
    this.closeModal.emit(); // Phát sự kiện đóng modal
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}