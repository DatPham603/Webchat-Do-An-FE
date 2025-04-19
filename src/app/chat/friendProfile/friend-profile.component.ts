import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgIf, NgClass } from '@angular/common';
import { AvatarService } from '../../service/avatar.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UserDTO } from '../../model/dto.model';
import { ActivatedRoute } from '@angular/router'; 

@Component({
  selector: 'friend-infor',
  standalone: true,
  imports: [FormsModule, HttpClientModule, NgIf, NgClass],
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
  private readonly destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private avatarService: AvatarService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute // Inject ActivatedRoute
  ) { }


  async ngOnInit(): Promise<void> {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const idFromRoute = params.get('id');
      if (idFromRoute) {
        this.userId = idFromRoute;
        this.fetchFriendDataAsync(this.userId);
      } else if (this.userId) { // Nếu userId được truyền trực tiếp (từ modal)
        this.fetchFriendDataAsync(this.userId);
      } else {
        console.error('Không có ID người bạn.');
      }
    });
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  // Hàm này giờ sẽ nhận userId trực tiếp
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


  // onFriendClick(friendId: string): void {
  //   this.showFriend.emit(friendId);
  // }

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